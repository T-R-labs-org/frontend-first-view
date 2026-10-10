import assert from "node:assert/strict";
import {
  parseSelectorEditor,
  serializeSelectorEditor,
} from "../src/lib/scenario-selector-editor.ts";

assert.deepEqual(parseSelectorEditor("text=About"), { type: "text", value: "About" });
assert.deepEqual(parseSelectorEditor("label=IlyaCreates home"), {
  type: "label",
  value: "IlyaCreates home",
});
assert.deepEqual(parseSelectorEditor("text=01About"), { type: "text", value: "About" });
assert.deepEqual(parseSelectorEditor("text=About"), parseSelectorEditor("text=01About"));
assert.deepEqual(parseSelectorEditor("text=21Account"), { type: "text", value: "21Account" });
assert.deepEqual(parseSelectorEditor("#email"), { type: "css", value: "#email" });

assert.equal(serializeSelectorEditor({ type: "text", value: "About" }), "text=About");
assert.equal(
  serializeSelectorEditor({ type: "label", value: "IlyaCreates home" }),
  "label=IlyaCreates home",
);
assert.equal(
  serializeSelectorEditor(parseSelectorEditor("text=01About")),
  "text=About",
);

console.log("selector editor tests passed");
