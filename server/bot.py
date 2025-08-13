import os
import uuid

import aiohttp
from dotenv import load_dotenv
from loguru import logger

load_dotenv(override=True)

print("🚀 Starting Pipecat bot...")
print("⏳ Loading AI models (30-40 seconds first run, <2 seconds after)\n")

logger.info("Loading Silero VAD model...")
from pipecat.audio.vad.silero import SileroVADAnalyzer

logger.info("✅ Silero VAD model loaded")
logger.info("Loading pipeline components...")
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIObserver, RTVIProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.services.whisper.stt import MLXModel, WhisperSTTServiceMLX
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import BaseTransport, TransportParams

from pipecat_langgraph import LanggraphProcessor

logger.info("✅ Pipeline components loaded")

logger.info("Loading WebRTC transport...")
from pipecat.transports.network.small_webrtc import SmallWebRTCTransport

logger.info("✅ All components loaded successfully!")


async def run_bot(transport: BaseTransport):
    logger.info(f"Starting bot")

    # stt = WhisperSTTServiceMLX(
    #     model=MLXModel.LARGE_V3_TURBO,  # Quantized for efficiency
    #     no_speech_prob=0.6,
    #     language=Language.EN,
    # )

    stt = OpenAISTTService(
        model="gpt-4o-transcribe",
        api_key=os.getenv("OPENAI_API_KEY"),
        language=Language.EN,
    )

    session = aiohttp.ClientSession()

    # tts = SarvamTTSService(
    #     api_key=os.getenv("SARVAM_API_KEY"),
    #     voice_id="anushka",
    #     model="bulbul:v2",
    #     aiohttp_session=session,
    #     params=SarvamTTSService.InputParams(
    #         language=Language.HI,
    #         pitch=0.1,
    #         pace=1.2,
    #         loudness=1.0
    #     )
    # )

    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID"),
        model="eleven_flash_v2_5",
        params=ElevenLabsTTSService.InputParams(
            language=Language.EN,
            stability=0.7,
            similarity_boost=0.8,
            style=0.5,
            use_speaker_boost=True,
            speed=1.1,
        ),
    )

    llm = OpenAILLMService(model="gpt-4.1-mini", api_key=os.getenv("OPENAI_API_KEY"))

    messages = [
        {
            "role": "system",
            "content": "You are a friendly AI assistant. Respond naturally and keep your answers conversational.",
        },
    ]

    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))

    # Initialize thread_id and user_id as None - they will be set when client connects
    thread_id = None
    user_id = None

    lg = LanggraphProcessor(thread_id=thread_id, user_id=user_id)

    pipeline = Pipeline(
        [
            transport.input(),  # Transport user input
            rtvi,  # RTVI processor
            stt,
            context_aggregator.user(),  # User responses
            lg,  # LLM
            tts,  # TTS
            transport.output(),  # Transport bot output
            context_aggregator.assistant(),  # Assistant spoken responses
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[RTVIObserver(rtvi)],
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected")

        # For now, we'll use a simple approach: generate new IDs for each connection
        # This ensures each conversation gets a unique thread
        thread_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        logger.info(f"Generated new thread_id: {thread_id}, user_id: {user_id}")

        # Update the LangGraph processor with the new IDs
        lg.update_ids(thread_id, user_id)
        logger.info(
            f"Successfully updated LangGraph processor with thread_id: {thread_id}"
        )

        # # Kick off the conversation.
        # messages.append(
        #     {"role": "system", "content": "Say hello and briefly introduce yourself."}
        # )
        # await task.queue_frames([context_aggregator.user().get_context_frame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected")
        await task.cancel()

    runner = PipelineRunner(handle_sigint=False)

    await runner.run(task)


async def bot(runner_args: RunnerArguments):
    """Main bot entry point for the bot starter."""

    transport = SmallWebRTCTransport(
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
        webrtc_connection=runner_args.webrtc_connection,
    )

    await run_bot(transport)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
