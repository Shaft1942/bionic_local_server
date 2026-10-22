"""Offline contract test: the custom node only schedules flags, never frees GPU inline."""
import importlib.util
import math
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class CleanupNodeTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        queue = types.SimpleNamespace(set_flag=lambda *args: self.calls.append(args))
        self.server = types.SimpleNamespace(instance=types.SimpleNamespace(prompt_queue=queue))
        source = Path(__file__).resolve().parents[1] / "comfyui/custom_nodes/free_memory_after_workflow.py"
        spec = importlib.util.spec_from_file_location("cleanup_node_contract", source)
        self.module = importlib.util.module_from_spec(spec)
        # Only this server stub is provided. Importing Torch/model_management would fail.
        with patch.dict(sys.modules, {"server": types.SimpleNamespace(PromptServer=self.server)}):
            spec.loader.exec_module(self.module)
        self.node = self.module.NODE_CLASS_MAPPINGS["FreeMemoryAfterWorkflow"]

    def test_deferred_cleanup_and_each_run(self):
        self.assertTrue(self.node.OUTPUT_NODE)
        self.assertEqual(self.node.RETURN_TYPES, ())
        self.assertEqual(self.node.INPUT_TYPES()["optional"]["trigger"][0], "*")
        self.assertTrue(self.node.VALIDATE_INPUTS({"trigger": "IMAGE"}))
        for _ in range(2):
            self.assertTrue(math.isnan(self.node.IS_CHANGED()))
            self.assertEqual(self.node().request_cleanup(object()), ())
        self.assertEqual(self.calls, [("unload_models", True), ("free_memory", True)] * 2)

    def test_unavailable_queue_is_an_error_not_silent_success(self):
        self.server.instance = None
        with self.assertRaisesRegex(RuntimeError, "queue is unavailable"):
            self.node().request_cleanup()
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
