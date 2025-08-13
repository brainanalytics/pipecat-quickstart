import json
import uuid
import os
from loguru import logger
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
)
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContextFrame
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.llm_service import LLMService


class LanggraphProcessor(LLMService):
    def __init__(self, thread_id: str = None, user_id: str = None):
        super().__init__()
        self.thread_id = thread_id or str(uuid.uuid4())
        self.user_id = user_id or str(uuid.uuid4())

    def update_ids(self, thread_id: str, user_id: str):
        """Update the thread_id and user_id after client connection"""
        self.thread_id = thread_id
        self.user_id = user_id
        logger.info(
            f"Updated LangGraph processor with thread_id: {thread_id}, user_id: {user_id}"
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, OpenAILLMContextFrame):
            # Messages are accumulated by the `LLMUserResponseAggregator` in a list of messages.
            # The last one by the human is the one we want to send to the LLM.
            logger.debug(f"Got transcription frame {frame}")

            print(frame.context.messages[-1])
            print(type(frame.context.messages[-1]))

            text: str = frame.context.messages[-1]["content"]
            await self._ainvoke(text.strip())
        else:
            await self.push_frame(frame, direction)

    async def _ainvoke(self, text: str):
        logger.debug(f"Invoking agent with {text}")
        await self.push_frame(LLMFullResponseStartFrame())
        try:

            import aiohttp
            from pipecat.frames.frames import (
                FunctionCallFromLLM,
                FunctionCallInProgressFrame,
                FunctionCallResultFrame,
                FunctionCallsStartedFrame,
            )

            request_body = {
                "message": text,
                "model": "gpt-4o-mini",
                "thread_id": self.thread_id,
                "user_id": self.user_id,
                "agent_config": {"spicy_level": 0.8},
                "stream_tokens": True,
            }

            logger.info(
                f"Sending request to LangGraph with thread_id: {self.thread_id}, user_id: {self.user_id}"
            )
            logger.debug(f"Full request body: {request_body}")

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    os.getenv("LANGGRAPH_ENDPOINT_URL"), json=request_body
                ) as response:
                    active_tool_calls = {}
                    tool_input_buffer = {}

                    async for line in response.content:
                        if line:
                            try:
                                line_text = line.decode("utf-8").strip()
                                if line_text.startswith("data: "):
                                    line_text = line_text[6:]

                                if line_text == "[DONE]":
                                    break

                                if line_text:
                                    response_data = json.loads(line_text)
                                    response_type = response_data.get("type")
                                    print(response_data)
                                    if response_type == "reasoning-start":
                                        # Reasoning started - could emit a frame here if needed
                                        logger.debug("Reasoning started")

                                    elif response_type == "reasoning-end":
                                        # Reasoning ended
                                        logger.debug("Reasoning ended")

                                    elif response_type == "tool-input-start":
                                        tool_call_id = response_data.get("toolCallId")
                                        tool_name = response_data.get("toolName")
                                        if tool_call_id and tool_name:
                                            tool_input_buffer[tool_call_id] = ""
                                            function_call = FunctionCallFromLLM(
                                                function_name=tool_name,
                                                tool_call_id=tool_call_id,
                                                arguments={},
                                                context=None,
                                            )
                                            active_tool_calls[tool_call_id] = (
                                                function_call
                                            )
                                            await self.push_frame(
                                                FunctionCallsStartedFrame(
                                                    [function_call]
                                                )
                                            )
                                            await self.push_frame(
                                                FunctionCallInProgressFrame(
                                                    function_name=tool_name,
                                                    tool_call_id=tool_call_id,
                                                    arguments={},
                                                )
                                            )

                                    elif response_type == "tool-input-delta":
                                        tool_text = response_data.get("text", "")
                                        tool_id = response_data.get("id")
                                        # Find the tool call by id or use the most recent one
                                        for (
                                            tool_call_id,
                                            buffer,
                                        ) in tool_input_buffer.items():
                                            tool_input_buffer[tool_call_id] += tool_text
                                            break

                                    elif response_type == "tool-input-end":
                                        # Tool input complete, update arguments
                                        for (
                                            tool_call_id,
                                            input_text,
                                        ) in tool_input_buffer.items():
                                            if tool_call_id in active_tool_calls:
                                                active_tool_calls[
                                                    tool_call_id
                                                ].arguments = {"query": input_text}
                                                # Emit function call result frame
                                                await self.push_frame(
                                                    FunctionCallResultFrame(
                                                        function_name=active_tool_calls[
                                                            tool_call_id
                                                        ].function_name,
                                                        tool_call_id=tool_call_id,
                                                        result=f"Tool call executed: {input_text}",
                                                    )
                                                )
                                        tool_input_buffer.clear()

                                    elif response_type == "text-start":
                                        # Text response starting
                                        logger.debug("Text response started")

                                    elif response_type == "text-delta":
                                        response_text = response_data.get("text", "")
                                        if response_text:
                                            await self.push_frame(
                                                LLMTextFrame(response_text)
                                            )

                                    elif response_type == "source-url":
                                        # Source URL information - could be handled if needed
                                        logger.debug(
                                            f"Source URL: {response_data.get('url')}"
                                        )

                            except json.JSONDecodeError as e:
                                # Handle non-JSON lines or partial data
                                continue

        except GeneratorExit:
            logger.exception(f"{self} generator was closed prematurely")
        except Exception as e:
            logger.exception(f"{self} an unknown error occurred: {e}")

        await self.push_frame(LLMFullResponseEndFrame())
