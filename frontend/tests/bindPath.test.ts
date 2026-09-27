// THE BINDING PATH GRAMMAR (REQUIREMENTS §81, engine/roundTrip/bindPath.ts): how a
// value on screen names its place in the record's data, and how an upload writes
// back to exactly that place — never inventing a line, never reshaping a record.
import test from "node:test";
import assert from "node:assert/strict";
import { bindPath, decodeOptions, encodeOptions, getAtPath, parseBindPath, pathExists, setAtPath } from "../src/engine/roundTrip/bindPath";

const sheet = {
  header: { batchNo: "B-1" },
  rows: [
    { id: "r-1", time: "09:00", viscosity: 20.1 },
    { id: "r/2=x", time: "10:00", viscosity: 20.4 },
  ],
  entries: [{ pcId: "PC-05", catchCountApprox: 3 }],
  generalComments: ["first", "second"],
  checkpoints: {} as Record<string, { value?: string; note?: string }>,
};

test("paths are written and read back: names, positions, @id and @key=value, with awkward ids encoded", () => {
  assert.equal(bindPath("rows", { id: "r-1" }, "viscosity"), "rows/@r-1/viscosity");
  assert.equal(bindPath("entries", { key: "pcId", value: "PC-05" }, "catchCountApprox"), "entries/@pcId=PC-05/catchCountApprox");
  assert.equal(bindPath("generalComments", 1), "generalComments/1");
  const awkward = bindPath("rows", { id: "r/2=x" }, "viscosity");
  assert.equal(getAtPath(sheet, awkward), 20.4);
  assert.deepEqual(parseBindPath("checkpoints/%37/value"), [{ key: "checkpoints" }, { key: "7" }, { key: "value" }]);
  assert.equal(parseBindPath(""), null);
  assert.equal(parseBindPath("rows//x"), null);
});

test("a value is set at its place and nowhere else; the original is untouched", () => {
  const out = setAtPath(sheet, "rows/@r-1/viscosity", 21.5);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.equal(getAtPath(out.data, "rows/@r-1/viscosity"), 21.5);
  assert.equal(getAtPath(sheet, "rows/@r-1/viscosity"), 20.1);
  assert.strictEqual(out.data.rows[1], sheet.rows[1]);
  assert.strictEqual(out.data.header, sheet.header);
});

test("a check point missing on a blank daily sheet is made when only names are missing on the way", () => {
  assert.equal(pathExists(sheet, "checkpoints/%37/value"), true);
  const out = setAtPath(sheet, "checkpoints/%37/value", "Yes");
  assert.ok(out.ok);
  if (out.ok) assert.deepEqual(out.data.checkpoints, { "7": { value: "Yes" } });
});

test("an upload never invents a line or reshapes a record", () => {
  assert.equal(setAtPath(sheet, "rows/@r-9/viscosity", 1).ok, false);
  assert.equal(setAtPath(sheet, "rows/5/viscosity", 1).ok, false);
  assert.equal(setAtPath(sheet, "generalComments/7", "x").ok, false);
  assert.equal(setAtPath(sheet, "header/batchNo/inner", "x").ok, false);
  assert.equal(pathExists(sheet, "rows/@r-9/viscosity"), false);
  assert.equal(pathExists(sheet, "missingList/0/x"), false);
});

test("choices survive the attribute both ways, and a bad attribute reads as none", () => {
  const raw = encodeOptions(["Yes", "No", { value: "A", label: "Accepted" }]);
  assert.deepEqual(decodeOptions(raw), [
    { value: "Yes", label: "Yes" },
    { value: "No", label: "No" },
    { value: "A", label: "Accepted" },
  ]);
  assert.deepEqual(decodeOptions("{not json"), []);
  assert.deepEqual(decodeOptions(null), []);
});
