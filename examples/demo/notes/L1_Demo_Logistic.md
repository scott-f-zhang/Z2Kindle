# Lecture 1: Logistic Regression (demo)

This is the Z2kindle demo chapter. It shows how notes are written: formulas, figure layouts and callout boxes. The content comes from the two demo slides bundled with the toolkit.

## 1.1 Classification with probabilities

Logistic regression does not output a class directly; it outputs the probability that a sample belongs to the positive class. Its hypothesis is

$$
h_\theta(x) = g(\theta^\top x) = \frac{1}{1 + e^{-\theta^\top x}}
$$

where $\theta$ is the parameter vector and $x$ the input features. The model predicts 1 when $h_\theta(x) \ge 0.5$ and 0 otherwise.

## 1.2 The sigmoid function

::: {.fig .side}
![Figure 1-1. The sigmoid function: outputs lie in (0, 1) and equal 0.5 at $z=0$ (red line).](figs/L1_Demo_Logistic/sigmoid.png)
:::

The function $g(z) = 1/(1+e^{-z})$ in the formula above is called the sigmoid function; its shape is shown in Figure 1-1. It squashes any real number into the interval $(0,1)$: for large $z$ the output approaches 1, for very negative $z$ it approaches 0, and at $z=0$ it is exactly 0.5. Because the output lies between 0 and 1, it can be read as a probability.

The function is smooth and monotonically increasing everywhere, so the 0.5 threshold corresponds exactly to the line $\theta^\top x = 0$, which is the model's decision boundary. In other words, although logistic regression outputs an S-shaped curve, the boundary it draws in input space is still linear.

Smoothness also matters for training: the derivative has the simple form $g'(z) = g(z)\,(1-g(z))$, which makes gradient-based optimisation convenient.

::: {.note}
**Note:** This is a demo "Note" box, used to flag suspected typos or unclear statements in the slides.
:::

## Summary

Logistic regression turns a linear score into a probability with the sigmoid function and classifies with a threshold of 0.5.

### Key Formulas

$$
h_\theta(x) = \frac{1}{1 + e^{-\theta^\top x}}
$$

### Key Terms

| Term | Meaning |
|---|---|
| logistic regression | a linear classifier that outputs class probabilities |
| sigmoid function | a function mapping real numbers to (0, 1) |
