import json
import uuid
from dataclasses import dataclass
from typing import Any, Union

from langchain.schema import Document
from langchain_core.messages import HumanMessage
from loguru import logger
from pipecat.frames.frames import (
    ControlFrame,
    DataFrame,
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesFrame,
    LLMTextFrame,
)
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContextFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.llm_service import FunctionCallFromLLM, LLMService

from agent_response import process_stream

try:
    from langchain_core.messages import AIMessageChunk
except ModuleNotFoundError as e:
    logger.exception(
        "In order to use Langgraph, you need to `pip install pipecat-ai[langchain]`. "
    )
    raise Exception(f"Missing module: {e}")

thread_id = str(uuid.uuid4())
user_id = str(uuid.uuid4())


@dataclass
class ToolResultMessage(DataFrame):
    result: Any
    type: str = "tool_result"

    def __str__(self):
        return f"{self.name}(result: {self.result})"

@dataclass
class LLMResponseEndFrame(ControlFrame):
    pass

@dataclass
class LLMResponseStartFrame(ControlFrame):
    pass


class LanggraphProcessor(LLMService):
    def __init__(self):
        super().__init__()


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
            
            request_body = {
                "message": text,
                "model": "gpt-4o-mini",
                "thread_id": thread_id,
                "user_id": user_id,
                "agent_config": {
                    "spicy_level": 0.8
                },
                "stream_tokens": True
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.dev.boris.brainanalytics.co/stream?agent_id=uncle-boris-agent",
                    json=request_body
                ) as response:
                    all_responses = []
                    print(response)
                    async for line in response.content:
                        if line:
                            try:
                                # Parse each line as JSON (assuming server-sent events or newline-delimited JSON)
                                print(line)
                                line_text = line.decode('utf-8').strip()
                                print(line_text)
                                if line_text:
                                    line_text = line_text[6:]
                                    print(line_text)
                                    response_data = json.loads(line_text)["content"]
                                    response_type = response_data.get("type", None)
                                    response = response_data.get("content", "")
                                    if response_type and response:
                                        print("Deepak1")
                                        await self.push_frame(LLMTextFrame(response))
                            except json.JSONDecodeError as e:
                                # Handle non-JSON lines or partial data
                                continue
            print("Deepak2")
            response = " ".join(all_responses)
        except GeneratorExit:
            logger.exception(f"{self} generator was closed prematurely")
        except Exception as e:
            logger.exception(f"{self} an unknown error occurred: {e}")
        
        print("Deepak3")
        

        await self.push_frame(LLMFullResponseEndFrame())