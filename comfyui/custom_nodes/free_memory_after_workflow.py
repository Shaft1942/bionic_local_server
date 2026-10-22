"""ComfyUI node equivalent to POST /free with both options set to true.

Copy this file into the active ComfyUI custom_nodes directory and restart.
The queue worker performs the cleanup after the current prompt completes.
No HTTP request, extra package, executor reset, or GPU operation runs here.
"""

import logging

from server import PromptServer


class FreeMemoryAfterWorkflow:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "trigger": ("*", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "request_cleanup"
    CATEGORY = "utils/memory"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Equivalent to POST /free with unload_models=true and free_memory=true. "
        "Cleanup happens AFTER the current workflow, not between nodes. "
        "Optional trigger accepts any output to establish an upstream dependency. "
        "Runs on each normal full workflow execution; mute this node to disable it."
    )

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        # The trigger is only a dependency; its value and type are not inspected.
        return True

    @classmethod
    def IS_CHANGED(cls, trigger=None):
        # Scheduling cleanup is a side effect and must not be skipped by caching.
        return float("nan")

    def request_cleanup(self, trigger=None):
        server = getattr(PromptServer, "instance", None)
        queue = getattr(server, "prompt_queue", None)
        if queue is None:
            raise RuntimeError("ComfyUI PromptServer queue is unavailable.")

        # Same flags as the /free route. The worker processes them after execute().
        queue.set_flag("unload_models", True)
        queue.set_flag("free_memory", True)
        logging.info(
            "[Free Memory after Workflow] Requested unload_models=true and "
            "free_memory=true; cleanup is deferred until this workflow finishes."
        )
        return ()


NODE_CLASS_MAPPINGS = {
    "FreeMemoryAfterWorkflow": FreeMemoryAfterWorkflow,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "FreeMemoryAfterWorkflow": "Free Memory after Workflow (/free)",
}
