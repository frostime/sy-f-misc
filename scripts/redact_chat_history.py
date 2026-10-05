#!/usr/bin/env python3
"""Create a privacy-redacted V2 GPT history for tree/branch/version debugging.

Only structural fields are copied. Unknown fields are discarded rather than
trying to enumerate every place where private content might occur.
"""
import argparse
import json
from pathlib import Path
import sys


class StructuralIds:
    """Validate ID types without changing IDs or references."""

    def convert(self, value):
        if value is not None and not isinstance(value, str):
            raise ValueError("Structural IDs must be strings or null")
        return value


def require_object(value, description):
    if not isinstance(value, dict):
        raise ValueError(f"{description} must be a JSON object")
    return value


def require_list(value, description):
    if not isinstance(value, list):
        raise ValueError(f"{description} must be a JSON array")
    return value


def safe_role(value):
    # An unexpected string may itself contain private data; do not echo it.
    if value not in ("user", "assistant", "system", "tool", ""):
        raise ValueError("Unsupported message role")
    return value


def redact_history(history, empty_content=False):
    require_object(history, "History")
    if history.get("schema") != 2:
        raise ValueError("Only native V2 histories (schema: 2) are supported")
    original_nodes = require_object(history.get("nodes"), "nodes")
    node_ids = StructuralIds()
    version_ids = StructuralIds()

    # Validate keys without changing them. Missing references remain missing;
    # no corresponding records are invented.
    for node_id in original_nodes:
        node_ids.convert(node_id)
    for node in original_nodes.values():
        require_object(node, "Node")
        for version_id in require_object(node.get("versions"), "versions"):
            version_ids.convert(version_id)

    redacted_nodes = {}
    version_count = 0
    for node_id, node in original_nodes.items():
        if node.get("type") not in ("message", "separator"):
            raise ValueError("Unsupported node type")
        redacted = {"type": node["type"], "role": safe_role(node.get("role"))}
        # Keep presence/absence and mismatches, not just valid tree shapes.
        for field in ("id", "parent"):
            if field in node:
                redacted[field] = node_ids.convert(node[field])
        if "children" in node:
            redacted["children"] = [node_ids.convert(child) for child in require_list(node["children"], "children")]
        if "currentVersionId" in node:
            redacted["currentVersionId"] = version_ids.convert(node["currentVersionId"])
        for field in ("hidden", "pinned", "loading"):
            if field in node:
                if not isinstance(node[field], bool):
                    raise ValueError("Node state flags must be booleans")
                redacted[field] = node[field]

        versions = {}
        for version_id, payload in node["versions"].items():
            require_object(payload, "Version payload")
            message = require_object(payload.get("message"), "Version message")
            preserved_version = version_ids.convert(version_id)
            preserved_node = node_ids.convert(node_id)
            safe_payload = {
                "message": {
                    "role": safe_role(message.get("role")),
                    "content": "" if empty_content else f"[{preserved_node} / {preserved_version}]",
                }
            }
            if "id" in payload:
                safe_payload["id"] = version_ids.convert(payload["id"])
            versions[preserved_version] = safe_payload
            version_count += 1
        redacted["versions"] = versions
        redacted_nodes[node_ids.convert(node_id)] = redacted

    result = {
        "schema": 2,
        "type": "history",
        "id": history.get("id"),
        "title": "匿名树结构诊断",
        "timestamp": 0,
        "sysPrompt": "",
        "nodes": redacted_nodes,
    }
    if "rootId" in history:
        result["rootId"] = node_ids.convert(history["rootId"])
    if "worldLine" in history:
        result["worldLine"] = [node_ids.convert(item) for item in require_list(history["worldLine"], "worldLine")]
    if "bookmarks" in history:
        bookmarks = history["bookmarks"]
        if isinstance(bookmarks, dict):
            result["bookmarks"] = {node_ids.convert(key): "" for key in bookmarks}
        elif isinstance(bookmarks, list):
            result["bookmarks"] = [node_ids.convert(item) for item in bookmarks]
        else:
            raise ValueError("bookmarks must be an object or array")
    return result, version_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Native V2 history JSON path")
    parser.add_argument("-o", "--output", type=Path, help="Default: <input stem>.redacted.json")
    parser.add_argument("--empty", action="store_true", help="Use empty text instead of node/version ID labels")
    args = parser.parse_args()
    source = args.input.resolve()
    destination = (args.output or source.with_name(source.stem + ".redacted.json")).resolve()
    try:
        if source == destination:
            raise ValueError("Output must not overwrite the input")
        if destination.exists():
            raise ValueError("Output already exists; choose another output path")
        with source.open("r", encoding="utf-8-sig") as stream:
            history = json.load(stream)
        redacted, version_count = redact_history(history, args.empty)
        # Exclusive creation protects existing files, including concurrent writes.
        with destination.open("x", encoding="utf-8") as stream:
            json.dump(redacted, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        print(f"Saved: {destination}")
        print(f"Nodes: {len(redacted['nodes'])}; versions: {version_count}")
    except (OSError, ValueError, TypeError) as error:
        # JSON/parser/OS error messages can contain input fragments or private paths.
        if isinstance(error, json.JSONDecodeError):
            detail = f"Invalid JSON at line {error.lineno}, column {error.colno}"
        elif isinstance(error, OSError):
            detail = f"File operation failed ({type(error).__name__})"
        elif isinstance(error, TypeError):
            detail = "Invalid structural field type"
        else:
            detail = str(error)
        print(f"Error: {detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
