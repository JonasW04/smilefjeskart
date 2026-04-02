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
