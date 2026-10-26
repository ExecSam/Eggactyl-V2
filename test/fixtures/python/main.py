import sys, time, requests, discord
print("BOT OK python", sys.version.split()[0], "requests", requests.__version__, "discord.py", discord.__version__, flush=True)
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("BOT got SIGINT, shutting down cleanly", flush=True)
