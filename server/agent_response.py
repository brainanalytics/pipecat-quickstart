import json
import logging
import os

from langgraph_sdk import get_client
from langgraph_sdk.schema import Command

logger = logging.getLogger(__name__)

client = get_client(url=os.getenv("LANGGRAPH_ENDPOINT_URL"), api_key=os.getenv("LANGSMITH_API_KEY"))

ASSISTANT_ID = os.getenv("LANGGRAPH_ASSISTANT_ID")


async def process_message(state):
    responses = []
    for value in state.values():
        if not isinstance(value, dict):
            continue
        message = value.get("response", None)
        if message:
            responses = [tm for tm in value["response"].split("\n\n")]

    return responses


# Stream processing function using SDK
async def process_stream(
    thread_id: str,
    input_data: dict,
    is_interrupt: bool = False,
):
    logger.info(f"Processing thread_id: {thread_id}")
    await client.threads.create(thread_id=thread_id)

    responses = []
    run_id = None
    state = None
    status = None
    match_odds_placeholders = ""

    run = await client.runs.create(
        thread_id=thread_id,
        assistant_id=ASSISTANT_ID,
        command=Command(resume=input_data["messages"][-1]["content"]) if is_interrupt else None,
        stream_mode=["updates", "custom"],  # Use "updates" to get state changes
        stream_subgraphs=True,
        input=input_data if not is_interrupt else None,
        multitask_strategy="rollback",
    )
    async for event in client.runs.join_stream(thread_id=thread_id, run_id=run["run_id"]):
        logger.debug(f"Event: {event}")

        if event.event[:6] == "custom":
            if event.data.get("processing_message", None) is not None:
                logger.info("Sending processing message")
            elif event.data.get("reaction", None) is not None:
                logger.info("Sending reaction")
            elif event.data.get("sticker", None) is not None:
                logger.info("Sending sticker")
            elif event.data.get("match_odds_placeholders", None) is not None:
                match_odds_placeholders = ",".join(
                    (
                        f"{{{{ match_detail_link(match_id: {odds.get('odds_id')} ) }}}}"
                        if odds.get("odds_id", None)
                        else f"{{{{ match_detail_link(ext_match_id: {odds.get('match_id')} ) }}}}"
                    )
                    for odds in event.data["match_odds_placeholders"]
                )
            elif event.data.get("process_message", None) is not None:
                responses = await process_message(event.data)
                if responses:
                    status = "completed"

        # Process each event
        elif event.event[:7] == "updates" and event.data:
            logger.debug("================================================")
            for key, value in event.data.items():
                logger.debug(f"{key}: {json.dumps(value, indent=2)}")
            logger.debug("================================================")

            state = event.data

            if state.get("__interrupt__", None) is not None:
                responses.append(state["__interrupt__"][0]["value"])
                status = "interrupted"
                break

            responses = await process_message(state)
            if responses:
                status = "completed"
                break
        elif event.event[:5] == "error" and event.data:
            logger.error(f"Error: {event.data}")
            if event.data.get("error", None) == "UserRollback":
                responses.append("Execution Cancelled because of double message")
                status = "rollback"
                break
            elif event.data.get("error", None) == "HTTPException":
                responses.append("Execution Cancelled because of double message")
                status = "rollback"
                break
            else:
                responses.append("Oops, something went wrong. Please try again.")
                status = "error"
                break
        elif event.event[:8] == "metadata" and event.data.get("run_id", None):
            logger.debug(f"Metadata: {event.data}")
            run_id = event.data["run_id"]

    logger.info(f"Responses: {responses}")
    logger.info(f"Run ID: {run_id}")
    logger.info(f"Status: {status}")
    logger.info(f"Match Odds Placeholders: {match_odds_placeholders}")
    if match_odds_placeholders: 
        responses.append(match_odds_placeholders)
    result = {
        "status": status if status is not None else "completed",
        "responses": responses,
        "run_id": run_id,
    }

    return result
