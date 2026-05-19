export function runner(suiteName) {
  let passed = 0, failed = 0;
  console.log(`\n${suiteName}`);
  console.log("-".repeat(suiteName.length));
  return {
    test(name, fn) {
      try {
        fn();
        console.log(`  ok  ${name}`);
        passed++;
      } catch (e) {
        console.log(`  FAIL ${name}`);
        console.log(`       ${e.message}`);
        failed++;
      }
    },
    finish() {
      console.log("-".repeat(suiteName.length));
      console.log(`${passed} passed, ${failed} failed`);
      process.exit(failed === 0 ? 0 : 1);
    }
  };
}

export function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? "eq"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export function assertDeepEq(a, b, msg) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg ?? "deep-eq"}: expected ${jb}, got ${ja}`);
}

export function assertIncludes(haystack, needle, msg) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${msg ?? "includes"}: '${needle}' not found in output`);
  }
}

export function assertNotIncludes(haystack, needle, msg) {
  if (String(haystack).includes(needle)) {
    throw new Error(`${msg ?? "not-includes"}: '${needle}' should not appear in output`);
  }
}
