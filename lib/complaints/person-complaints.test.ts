import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { countForPerson, describeCounts, ragForCounts } from "./person-complaints.ts";

const c = (upheld: boolean | null) => ({ upheld });

describe("counting complaints about a team member", () => {
  it("separates upheld, not upheld and still open", () => {
    const counts = countForPerson([c(true), c(false), c(null), c(false)]);
    assert.deepEqual(counts, { total: 4, upheld: 1, notUpheld: 2, undecided: 1 });
  });

  it("never treats an undecided complaint as cleared", () => {
    const counts = countForPerson([c(null)]);
    assert.equal(counts.notUpheld, 0, "no finding yet is not a finding of not upheld");
    assert.equal(counts.undecided, 1);
  });

  it("counts nothing as nothing", () => {
    assert.deepEqual(countForPerson([]), { total: 0, upheld: 0, notUpheld: 0, undecided: 0 });
  });
});

describe("how the tile reads", () => {
  it("says no complaints rather than zero", () => {
    assert.equal(describeCounts(countForPerson([])), "No complaints");
  });

  it("always says the outcome alongside the number", () => {
    assert.equal(describeCounts(countForPerson([c(false), c(false), c(false)])), "3 not upheld");
    assert.equal(describeCounts(countForPerson([c(true), c(false)])), "1 upheld, 1 not upheld");
    assert.equal(
      describeCounts(countForPerson([c(true), c(false), c(null)])),
      "1 upheld, 1 not upheld, 1 still open",
    );
  });
});

describe("what colours the tile", () => {
  it("is not coloured by complaints that were dismissed", () => {
    assert.equal(ragForCounts(countForPerson([c(false), c(false), c(false)])), "none");
  });

  it("is not coloured by complaints nobody has decided yet", () => {
    assert.equal(ragForCounts(countForPerson([c(null), c(null)])), "none");
  });

  it("turns amber on one upheld and red on two", () => {
    assert.equal(ragForCounts(countForPerson([c(true)])), "amber");
    assert.equal(ragForCounts(countForPerson([c(true), c(true)])), "red");
  });
});
