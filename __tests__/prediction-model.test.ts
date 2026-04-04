import { describe, it, expect } from "vitest";

// We test the pure model functions by re-implementing them here
// (they're embedded in a "use client" page component, so we extract the logic)

// ---------------------------------------------------------------------------
// Functions under test (copied from prediction/page.tsx for unit testing)
// ---------------------------------------------------------------------------

function sigmoid(x: number): number {
  if (x > 500) return 1;
  if (x < -500) return 0;
  return 1 / (1 + Math.exp(-x));
}

function trainLogisticRegression(
  X: number[][],
  y: number[],
  learningRate: number,
  epochs: number,
  lambda: number,
): { weights: number[]; bias: number } {
  const n = X.length;
  if (n === 0) return { weights: [], bias: 0 };
  const featureCount = X[0].length;
  const weights = new Array<number>(featureCount).fill(0);
  let bias = 0;

  const posCount = y.filter((v) => v === 1).length;
  const negCount = n - posCount;
  const wPos = posCount > 0 ? n / (2 * posCount) : 1;
  const wNeg = negCount > 0 ? n / (2 * negCount) : 1;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const dW = new Array<number>(featureCount).fill(0);
    let dB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < featureCount; j++) {
        z += weights[j] * X[i][j];
      }
      const pred = sigmoid(z);
      const sampleWeight = y[i] === 1 ? wPos : wNeg;
      const error = (pred - y[i]) * sampleWeight;
      for (let j = 0; j < featureCount; j++) {
        dW[j] += error * X[i][j];
      }
      dB += error;
    }

    for (let j = 0; j < featureCount; j++) {
      weights[j] -= (learningRate / n) * (dW[j] + lambda * weights[j]);
    }
    bias -= (learningRate / n) * dB;
  }

  return { weights, bias };
}

function predictProba(
  features: number[],
  weights: number[],
  bias: number,
): number {
  let z = bias;
  for (let j = 0; j < features.length; j++) {
    z += weights[j] * features[j];
  }
  return sigmoid(z);
}

type EvalMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
  positiveCount: number;
  negativeCount: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
};

function computeAucRoc(probabilities: number[], labels: number[]): number {
  if (probabilities.length === 0) return 0;
  const totalPos = labels.filter((l) => l === 1).length;
  const totalNeg = labels.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) return 0.5;

  const pairs = probabilities
    .map((p, i) => ({ p, label: labels[i] }))
    .sort((a, b) => b.p - a.p);

  let auc = 0;
  let tpCount = 0;
  let fpCount = 0;
  let prevTpr = 0;
  let prevFpr = 0;

  for (const { label } of pairs) {
    if (label === 1) tpCount++;
    else fpCount++;
    const tpr = tpCount / totalPos;
    const fpr = fpCount / totalNeg;
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }

  return auc;
}

function computeMetrics(
  probabilities: number[],
  labels: number[],
  threshold = 0.5,
): EvalMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < labels.length; i++) {
    const pred = probabilities[i] >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 0) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = labels.length > 0 ? (tp + tn) / labels.length : 0;
  const aucRoc = computeAucRoc(probabilities, labels);

  return {
    accuracy, precision, recall, f1, aucRoc,
    positiveCount: tp + fn, negativeCount: tn + fp,
    truePositives: tp, falsePositives: fp,
    trueNegatives: tn, falseNegatives: fn,
  };
}

function calibrateDaysWeight(
  model: { weights: number[]; bias: number },
  testX: number[][],
  testY: number[],
  daysTestFeatures: number[],
  candidates: number[],
): number {
  let bestWeight = 0;
  let bestF1 = -1;

  for (const dw of candidates) {
    const probs = testX.map((x, i) => {
      const modelLogit = model.weights.reduce(
        (sum, w, j) => sum + w * x[j], model.bias,
      );
      return sigmoid(modelLogit + dw * daysTestFeatures[i]);
    });
    const m = computeMetrics(probs, testY);
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestWeight = dw;
    }
  }

  return bestWeight;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sigmoid", () => {
  it("returns 0.5 for input 0", () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 5);
  });

  it("returns ~1 for large positive input", () => {
    expect(sigmoid(10)).toBeGreaterThan(0.999);
    expect(sigmoid(500)).toBe(1);
    expect(sigmoid(600)).toBe(1);
  });

  it("returns ~0 for large negative input", () => {
    expect(sigmoid(-10)).toBeLessThan(0.001);
    expect(sigmoid(-500)).toBeLessThan(1e-100);
    expect(sigmoid(-600)).toBeLessThan(1e-100);
  });

  it("is monotonically increasing", () => {
    expect(sigmoid(-2)).toBeLessThan(sigmoid(-1));
    expect(sigmoid(-1)).toBeLessThan(sigmoid(0));
    expect(sigmoid(0)).toBeLessThan(sigmoid(1));
    expect(sigmoid(1)).toBeLessThan(sigmoid(2));
  });
});

describe("trainLogisticRegression", () => {
  it("returns empty weights for empty data", () => {
    const result = trainLogisticRegression([], [], 0.5, 100, 0.01);
    expect(result.weights).toHaveLength(0);
    expect(result.bias).toBe(0);
  });

  it("learns to separate linearly separable data", () => {
    // Simple 1D data: x < 0.5 → 0, x > 0.5 → 1
    const X = [
      [0.1], [0.2], [0.3],
      [0.7], [0.8], [0.9],
    ];
    const y = [0, 0, 0, 1, 1, 1];
    const result = trainLogisticRegression(X, y, 1.0, 200, 0.01);

    expect(result.weights).toHaveLength(1);
    // Weight should be positive (higher x → higher probability)
    expect(result.weights[0]).toBeGreaterThan(0);

    // Check predictions
    const lowProb = predictProba([0.1], result.weights, result.bias);
    const highProb = predictProba([0.9], result.weights, result.bias);
    expect(lowProb).toBeLessThan(0.5);
    expect(highProb).toBeGreaterThan(0.5);
  });

  it("handles class imbalance with weighting", () => {
    // 90% negative, 10% positive — model should still learn
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 90; i++) {
      X.push([Math.random() * 0.4]);
      y.push(0);
    }
    for (let i = 0; i < 10; i++) {
      X.push([0.6 + Math.random() * 0.4]);
      y.push(1);
    }

    const result = trainLogisticRegression(X, y, 0.5, 300, 0.01);
    // Weight should still be positive
    expect(result.weights[0]).toBeGreaterThan(0);
  });

  it("L2 regularization reduces weight magnitude", () => {
    const X = [[1], [2], [3], [4], [5]];
    const y = [0, 0, 1, 1, 1];

    const noReg = trainLogisticRegression(X, y, 0.5, 200, 0);
    const withReg = trainLogisticRegression(X, y, 0.5, 200, 1.0);

    expect(Math.abs(withReg.weights[0])).toBeLessThan(Math.abs(noReg.weights[0]));
  });
});

describe("computeMetrics", () => {
  it("computes perfect metrics for perfect predictions", () => {
    const probs = [0.9, 0.8, 0.1, 0.2];
    const labels = [1, 1, 0, 0];
    const m = computeMetrics(probs, labels);

    expect(m.accuracy).toBe(1);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
    expect(m.truePositives).toBe(2);
    expect(m.trueNegatives).toBe(2);
    expect(m.falsePositives).toBe(0);
    expect(m.falseNegatives).toBe(0);
  });

  it("computes zero F1 when all predictions are wrong", () => {
    const probs = [0.1, 0.2, 0.9, 0.8];
    const labels = [1, 1, 0, 0];
    const m = computeMetrics(probs, labels);

    expect(m.accuracy).toBe(0);
    expect(m.f1).toBe(0);
    expect(m.falsePositives).toBe(2);
    expect(m.falseNegatives).toBe(2);
  });

  it("handles precision/recall tradeoff", () => {
    // All predicted as positive
    const probs = [0.9, 0.8, 0.7, 0.6];
    const labels = [1, 0, 0, 0];
    const m = computeMetrics(probs, labels);

    expect(m.recall).toBe(1); // All positives found
    expect(m.precision).toBe(0.25); // But many false positives
    expect(m.truePositives).toBe(1);
    expect(m.falsePositives).toBe(3);
  });

  it("handles empty input", () => {
    const m = computeMetrics([], []);
    expect(m.accuracy).toBe(0);
    expect(m.f1).toBe(0);
  });
});

describe("computeAucRoc", () => {
  it("returns 1.0 for perfect separation", () => {
    const probs = [0.9, 0.8, 0.2, 0.1];
    const labels = [1, 1, 0, 0];
    expect(computeAucRoc(probs, labels)).toBeCloseTo(1.0, 2);
  });

  it("returns ~0.5 for random predictions", () => {
    // Interleaved predictions have AUC near 0.5
    const probs = [0.9, 0.7, 0.5, 0.3];
    const labels = [1, 0, 1, 0];
    const auc = computeAucRoc(probs, labels);
    expect(auc).toBeGreaterThan(0.3);
    expect(auc).toBeLessThan(0.8);
  });

  it("returns 0 for perfectly inverted predictions", () => {
    const probs = [0.1, 0.2, 0.8, 0.9];
    const labels = [1, 1, 0, 0];
    expect(computeAucRoc(probs, labels)).toBeCloseTo(0, 2);
  });

  it("returns 0.5 when all same class", () => {
    expect(computeAucRoc([0.5, 0.6], [1, 1])).toBe(0.5);
    expect(computeAucRoc([0.5, 0.6], [0, 0])).toBe(0.5);
  });

  it("handles empty input", () => {
    expect(computeAucRoc([], [])).toBe(0);
  });
});

describe("predictProba", () => {
  it("returns 0.5 with zero weights and zero bias", () => {
    expect(predictProba([1, 2, 3], [0, 0, 0], 0)).toBeCloseTo(0.5, 5);
  });

  it("returns higher probability for positive weighted features", () => {
    const weights = [1, 0, 0];
    const bias = 0;
    const low = predictProba([0], weights, bias);
    const high = predictProba([2], weights, bias);
    expect(high).toBeGreaterThan(low);
  });
});

describe("full training pipeline", () => {
  it("achieves reasonable AUC on synthetic data", () => {
    // Generate synthetic data: feature correlates with label
    const X: number[][] = [];
    const y: number[] = [];

    // Positives: higher feature values
    for (let i = 0; i < 30; i++) {
      X.push([0.6 + Math.random() * 0.4, Math.random()]);
      y.push(1);
    }
    // Negatives: lower feature values
    for (let i = 0; i < 270; i++) {
      X.push([Math.random() * 0.5, Math.random()]);
      y.push(0);
    }

    const model = trainLogisticRegression(X, y, 0.5, 300, 0.01);
    const probs = X.map((x) => predictProba(x, model.weights, model.bias));
    const metrics = computeMetrics(probs, y);

    // With class weighting, should get reasonable AUC
    expect(metrics.aucRoc).toBeGreaterThan(0.6);
    // F1 should be non-trivial
    expect(metrics.f1).toBeGreaterThan(0.1);
  });
});

describe("calibrateDaysWeight", () => {
  it("returns 0 when all candidates produce zero F1", () => {
    // Model with no useful signal, all negatives
    const model = { weights: [0], bias: 0 };
    const testX = [[0.1], [0.2], [0.3]];
    const testY = [0, 0, 0];
    const daysFeat = [0.5, 0.5, 0.5];
    const candidates = [0, 0.5, 1.0];

    const best = calibrateDaysWeight(model, testX, testY, daysFeat, candidates);
    expect(best).toBe(0); // all F1s are 0, so first candidate wins
  });

  it("picks the candidate that best separates positives from negatives", () => {
    // Positives have high daysFeat, negatives have low daysFeat
    // A higher days weight should help separate them
    const model = { weights: [0], bias: -2 };
    const testX = [[0.5], [0.5], [0.5], [0.5]];
    const testY = [1, 1, 0, 0];
    const daysFeat = [0.9, 0.8, 0.1, 0.2];
    const candidates = [0, 0.5, 1.0, 2.0, 5.0];

    const best = calibrateDaysWeight(model, testX, testY, daysFeat, candidates);
    // A positive weight should be selected since positives have high daysFeat
    expect(best).toBeGreaterThan(0);
  });

  it("prefers a lower weight when days feature does not help", () => {
    // Days feature is identical for all samples — should not matter
    const model = { weights: [2], bias: -1 };
    const testX = [[0.1], [0.2], [0.8], [0.9]];
    const testY = [0, 0, 1, 1];
    const daysFeat = [0.5, 0.5, 0.5, 0.5];
    const candidates = [0, 0.5, 1.0, 2.0];

    const best = calibrateDaysWeight(model, testX, testY, daysFeat, candidates);
    // All candidates produce the same F1 (daysFeat is constant), so 0 wins (first)
    expect(best).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// New functions: tree ensemble, threshold calibration, type classification
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS: [string, number][] = [
  ["restaurant", 1], ["kafé", 2], ["kafe", 2], ["cafe", 2],
  ["sushi", 3], ["pizza", 4], ["kebab", 5],
  ["bakeri", 6], ["bakery", 6], ["konditor", 6],
  ["hotell", 7], ["hotel", 7],
  ["barnehage", 8], ["skole", 8],
  ["sykehjem", 9], ["sykehus", 9],
  ["butikk", 10], ["dagligvare", 10], ["kiwi", 10], ["rema", 10], ["coop", 10], ["meny", 10],
  ["kiosk", 11], ["narvesen", 11],
  ["bar", 12], ["pub", 12],
  ["gatekjøkken", 13], ["grill", 13],
  ["catering", 14],
  ["bensinstasjon", 15],
];

function classifyEstablishmentType(navn: string): number {
  const lower = navn.toLowerCase();
  for (const [keyword, typeCode] of TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return typeCode;
  }
  return 0;
}

type TreeNode = {
  featureIndex: number;
  threshold: number;
  left: TreeNode | number;
  right: TreeNode | number;
};

function giniImpurity(pos: number, neg: number): number {
  const total = pos + neg;
  if (total === 0) return 0;
  const p = pos / total;
  return 2 * p * (1 - p);
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDecisionTree(
  X: number[][],
  y: number[],
  maxDepth: number,
  minSamples: number,
  rng: () => number,
): TreeNode | number {
  if (X.length <= minSamples || maxDepth === 0) {
    return y.length > 0 ? y.reduce((a, b) => a + b, 0) / y.length : 0.5;
  }
  const posCount = y.filter((v) => v === 1).length;
  if (posCount === 0 || posCount === y.length) {
    return posCount / y.length;
  }

  const nFeatures = X[0].length;
  const subsetSize = Math.max(Math.floor(Math.sqrt(nFeatures)), 1);
  const available = Array.from({ length: nFeatures }, (_, i) => i);
  const selectedFeatures: number[] = [];
  for (let i = 0; i < subsetSize && available.length > 0; i++) {
    const idx = Math.floor(rng() * available.length);
    selectedFeatures.push(available.splice(idx, 1)[0]);
  }

  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;
  const totalNeg = y.length - posCount;
  const parentImpurity = giniImpurity(posCount, totalNeg);

  for (const fi of selectedFeatures) {
    const values = X.map((x) => x[fi]).sort((a, b) => a - b);
    const steps = Math.min(10, values.length - 1);
    for (let s = 1; s <= steps; s++) {
      const idx = Math.floor((s / (steps + 1)) * values.length);
      const threshold = values[idx];
      let lp = 0, ln = 0, rp = 0, rn = 0;
      for (let i = 0; i < X.length; i++) {
        if (X[i][fi] <= threshold) {
          if (y[i] === 1) lp++; else ln++;
        } else {
          if (y[i] === 1) rp++; else rn++;
        }
      }
      const leftTotal = lp + ln;
      const rightTotal = rp + rn;
      if (leftTotal === 0 || rightTotal === 0) continue;
      const gain = parentImpurity -
        (leftTotal * giniImpurity(lp, ln) + rightTotal * giniImpurity(rp, rn)) / X.length;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = threshold;
      }
    }
  }

  if (bestGain <= 0) {
    return y.reduce((a, b) => a + b, 0) / y.length;
  }

  const leftX: number[][] = [], leftY: number[] = [];
  const rightX: number[][] = [], rightY: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i][bestFeature] <= bestThreshold) {
      leftX.push(X[i]); leftY.push(y[i]);
    } else {
      rightX.push(X[i]); rightY.push(y[i]);
    }
  }

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildDecisionTree(leftX, leftY, maxDepth - 1, minSamples, rng),
    right: buildDecisionTree(rightX, rightY, maxDepth - 1, minSamples, rng),
  };
}

function predictTree(node: TreeNode | number, features: number[]): number {
  if (typeof node === "number") return node;
  if (features[node.featureIndex] <= node.threshold) {
    return predictTree(node.left, features);
  }
  return predictTree(node.right, features);
}

function trainTreeEnsemble(
  X: number[][],
  y: number[],
  numTrees: number,
  maxDepth: number,
  minSamples: number,
  sampleFraction: number,
  rng: () => number,
): (TreeNode | number)[] {
  const trees: (TreeNode | number)[] = [];
  for (let t = 0; t < numTrees; t++) {
    const sampleSize = Math.floor(X.length * sampleFraction);
    const sampleX: number[][] = [];
    const sampleY: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(rng() * X.length);
      sampleX.push(X[idx]);
      sampleY.push(y[idx]);
    }
    trees.push(buildDecisionTree(sampleX, sampleY, maxDepth, minSamples, rng));
  }
  return trees;
}

function predictEnsemble(trees: (TreeNode | number)[], features: number[]): number {
  const predictions = trees.map((t) => predictTree(t, features));
  return predictions.reduce((a, b) => a + b, 0) / predictions.length;
}

function calibrateThreshold(
  probabilities: number[],
  labels: number[],
  candidates: number[],
): number {
  let bestThreshold = 0.5;
  let bestF1 = -1;
  for (const t of candidates) {
    const m = computeMetrics(probabilities, labels, t);
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

// ---------------------------------------------------------------------------
// Tests for new functions
// ---------------------------------------------------------------------------

describe("classifyEstablishmentType", () => {
  it("classifies restaurant names", () => {
    expect(classifyEstablishmentType("Oslo Restaurant AS")).toBe(1);
    expect(classifyEstablishmentType("Kafé Storgata")).toBe(2);
    expect(classifyEstablishmentType("Sushi Palace")).toBe(3);
    expect(classifyEstablishmentType("Pizza Express")).toBe(4);
  });

  it("classifies other establishment types", () => {
    expect(classifyEstablishmentType("Hotell Bristol")).toBe(7);
    expect(classifyEstablishmentType("Trollheim Barnehage")).toBe(8);
    expect(classifyEstablishmentType("Kiwi Majorstuen")).toBe(10);
    expect(classifyEstablishmentType("Narvesen Jernbanetorget")).toBe(11);
  });

  it("returns 0 for unknown types", () => {
    expect(classifyEstablishmentType("Firma AS")).toBe(0);
    expect(classifyEstablishmentType("Ukjent Sted")).toBe(0);
  });

  it("is case insensitive", () => {
    expect(classifyEstablishmentType("RESTAURANT OSLO")).toBe(1);
    expect(classifyEstablishmentType("Kebab House")).toBe(5);
  });
});

describe("giniImpurity", () => {
  it("returns 0 for pure nodes", () => {
    expect(giniImpurity(10, 0)).toBe(0);
    expect(giniImpurity(0, 10)).toBe(0);
    expect(giniImpurity(0, 0)).toBe(0);
  });

  it("returns 0.5 for perfectly balanced split", () => {
    expect(giniImpurity(5, 5)).toBeCloseTo(0.5, 5);
  });

  it("returns intermediate values for imbalanced splits", () => {
    const imp = giniImpurity(3, 7);
    expect(imp).toBeGreaterThan(0);
    expect(imp).toBeLessThan(0.5);
  });
});

describe("decision tree", () => {
  it("builds a leaf for small datasets", () => {
    const rng = mulberry32(42);
    const tree = buildDecisionTree([[1], [2]], [1, 0], 4, 5, rng);
    expect(typeof tree).toBe("number");
    expect(tree).toBeCloseTo(0.5, 5);
  });

  it("builds a leaf for pure datasets", () => {
    const rng = mulberry32(42);
    const tree = buildDecisionTree([[1], [2], [3]], [1, 1, 1], 4, 1, rng);
    expect(typeof tree).toBe("number");
    expect(tree).toBe(1);
  });

  it("learns to split linearly separable 1D data", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 50; i++) {
      X.push([i / 100]);
      y.push(0);
    }
    for (let i = 50; i < 100; i++) {
      X.push([i / 100]);
      y.push(1);
    }
    const rng = mulberry32(42);
    const tree = buildDecisionTree(X, y, 4, 2, rng);

    // Should predict low for low values and high for high values
    const lowPred = predictTree(tree, [0.1]);
    const highPred = predictTree(tree, [0.9]);
    expect(lowPred).toBeLessThan(0.3);
    expect(highPred).toBeGreaterThan(0.7);
  });
});

describe("tree ensemble", () => {
  it("trains multiple trees and produces valid probabilities", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 30; i++) {
      X.push([0.6 + Math.random() * 0.4, Math.random()]);
      y.push(1);
    }
    for (let i = 0; i < 270; i++) {
      X.push([Math.random() * 0.5, Math.random()]);
      y.push(0);
    }

    const rng = mulberry32(42);
    const trees = trainTreeEnsemble(X, y, 5, 3, 5, 0.8, rng);
    expect(trees.length).toBe(5);

    const prob = predictEnsemble(trees, [0.8, 0.5]);
    expect(prob).toBeGreaterThanOrEqual(0);
    expect(prob).toBeLessThanOrEqual(1);
  });

  it("achieves reasonable AUC on synthetic data", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 30; i++) {
      X.push([0.6 + Math.random() * 0.4, Math.random()]);
      y.push(1);
    }
    for (let i = 0; i < 270; i++) {
      X.push([Math.random() * 0.5, Math.random()]);
      y.push(0);
    }

    const rng = mulberry32(42);
    const trees = trainTreeEnsemble(X, y, 10, 4, 5, 0.8, rng);
    const probs = X.map((x) => predictEnsemble(trees, x));
    const auc = computeAucRoc(probs, y);
    expect(auc).toBeGreaterThan(0.6);
  });
});

describe("calibrateThreshold", () => {
  it("returns 0.5 when all candidates produce the same F1", () => {
    // All probabilities the same → F1 the same for any threshold above
    const probs = [0.3, 0.3, 0.3, 0.3];
    const labels = [1, 0, 1, 0];
    const candidates = [0.1, 0.2, 0.3, 0.4, 0.5];
    const best = calibrateThreshold(probs, labels, candidates);
    // 0.1 and 0.2 predict all positive (F1 > 0), 0.4 and 0.5 predict all negative (F1 = 0)
    // 0.3 is the boundary — depends on >= implementation
    expect(best).toBeLessThanOrEqual(0.3);
  });

  it("finds optimal threshold for well-separated probabilities", () => {
    const probs = [0.9, 0.8, 0.2, 0.1];
    const labels = [1, 1, 0, 0];
    const candidates = [0.1, 0.3, 0.5, 0.7, 0.9];
    const best = calibrateThreshold(probs, labels, candidates);
    // Any threshold between 0.2 and 0.8 should give perfect F1
    expect(best).toBeGreaterThanOrEqual(0.3);
    expect(best).toBeLessThanOrEqual(0.7);
  });

  it("prefers lower threshold for imbalanced data (more positives caught)", () => {
    // 1 positive, 3 negatives. Low threshold catches the positive but may have FP.
    const probs = [0.6, 0.4, 0.3, 0.2];
    const labels = [1, 0, 0, 0];
    const candidates = [0.1, 0.3, 0.5, 0.7];
    const best = calibrateThreshold(probs, labels, candidates);
    // Threshold 0.5 or 0.3 should give better F1 than 0.7
    expect(best).toBeLessThanOrEqual(0.5);
  });
});
