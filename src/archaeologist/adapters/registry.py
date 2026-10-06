from archaeologist.adapters.base import UnsupportedPlatform
from archaeologist.adapters.bedrock import BedrockAdapter
from archaeologist.adapters.java import JavaAdapter

ADAPTERS = (BedrockAdapter(), JavaAdapter())


def select_adapter(world_dir):
    bedrock = ADAPTERS[0]
    java = ADAPTERS[1]
    if bedrock.detect(world_dir) and not java.detect(world_dir):
        return bedrock
    if java.detect(world_dir) and not bedrock.detect(world_dir):
        raise UnsupportedPlatform(
            "This looks like a Java Edition world. Only Bedrock Edition is supported in this build."
        )
    if bedrock.detect(world_dir):
        return bedrock
    raise UnsupportedPlatform("No supported Minecraft world adapter matched this folder.")
