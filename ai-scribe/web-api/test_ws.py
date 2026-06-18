import asyncio
import json
import websockets
import base64
from app.config import settings

async def main():
    url = f"wss://api.openai.com/v1/realtime?intent=transcription"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}"
    }
    
    try:
        async with websockets.connect(url, additional_headers=headers) as ws:
            print("Connected!")
            await ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "transcription": {
                                "model": settings.REALTIME_TRANSCRIPTION_MODEL
                            },
                            "turn_detection": None
                        }
                    }
                },
            }))
            
            # Send valid PCM data (sine wave or just zero bytes)
            # 1 second of fake 24kHz audio (24000 samples * 2 bytes = 48000 bytes)
            print("Sending audio...")
            fake_audio = b"\x00" * 48000
            await ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(fake_audio).decode("utf-8")
            }))
            
            print("Sending commit...")
            await ws.send(json.dumps({
                "type": "input_audio_buffer.commit"
            }))
            
            while True:
                res = await asyncio.wait_for(ws.recv(), timeout=2.0)
                data = json.loads(res)
                print("Event:", data["type"])
                if data["type"] == "error":
                    print("Error:", json.dumps(data))
                    break
                elif "transcription" in data["type"]:
                    print("Transcription event:", json.dumps(data))
    except Exception as e:
        print("Done:", e)

asyncio.run(main())
