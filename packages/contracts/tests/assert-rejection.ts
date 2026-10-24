import assert from "node:assert/strict";

type Issue = { code: string; path: PropertyKey[]; message: string };
type FailResult = { success: false; error: { issues: Issue[] } };
type ParseResult = { success: boolean; error?: { issues: Issue[] } };

/**
 * Assert schema rejection and pin the first issue's path and/or code/message.
 */
export function assertRejection(
  result: ParseResult,
  expected: { path?: PropertyKey[]; code?: string; message?: string | RegExp },
): asserts result is FailResult {
  assert.equal(result.success, false, "expected schema rejection");
  assert.ok(result.error?.issues?.length, "expected at least one issue");
  const issue = result.error!.issues[0]!;
  if (expected.path !== undefined) {
    assert.deepEqual(issue.path, expected.path, `path: ${issue.message}`);
  }
  if (expected.code !== undefined) {
    assert.equal(issue.code, expected.code, `code for ${JSON.stringify(issue.path)}`);
  }
  if (expected.message !== undefined) {
    if (expected.message instanceof RegExp) {
      assert.match(issue.message, expected.message);
    } else {
      assert.equal(issue.message, expected.message);
    }
  }
  if (
    expected.path === undefined &&
    expected.code === undefined &&
    expected.message === undefined
  ) {
    assert.ok(
      issue.path !== undefined || issue.code,
      "rejection must expose path or code",
    );
  }
}
