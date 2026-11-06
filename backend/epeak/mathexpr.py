"""Safe expression evaluator for derived variables (replaces the old ``eval``).

Expressions reference columns either with backticks (`RMS Voltage PH1 PPA1`) or bare names
when the column name is a valid identifier. Only arithmetic, comparisons and a whitelist of
numpy functions are allowed; anything else (attribute access, imports, lambdas...) is rejected.
"""
from __future__ import annotations

import ast
import operator
import re

import numpy as np
import pandas as pd


def _diff(a):
    return np.concatenate([[np.nan], np.diff(a)])


FUNCTIONS = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "asin": np.arcsin, "acos": np.arccos, "atan": np.arctan, "atan2": np.arctan2,
    "sinh": np.sinh, "cosh": np.cosh, "tanh": np.tanh,
    "log": np.log, "ln": np.log, "log10": np.log10, "log2": np.log2,
    "sqrt": np.sqrt, "exp": np.exp, "abs": np.abs,
    "deg": np.degrees, "rad": np.radians, "round": np.round,
    "floor": np.floor, "ceil": np.ceil, "sign": np.sign,
    "min": np.minimum, "max": np.maximum, "clip": np.clip, "where": np.where,
    "diff": _diff, "cumsum": np.nancumsum,
    "mean": lambda a: np.full(np.shape(a), np.nanmean(a)),
    "isnan": np.isnan,
}
CONSTANTS = {"pi": np.pi, "e": np.e, "nan": np.nan, "inf": np.inf}

_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
}
_CMPOPS = {
    ast.Gt: operator.gt, ast.GtE: operator.ge, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Eq: operator.eq, ast.NotEq: operator.ne,
}


class ExpressionError(ValueError):
    pass


def evaluate(expr: str, df: pd.DataFrame) -> np.ndarray:
    if not expr or not expr.strip():
        raise ExpressionError("The formula is empty.")
    placeholders: dict[str, str] = {}

    def repl(m: re.Match) -> str:
        name = m.group(1)
        if name not in df.columns:
            raise ExpressionError(f"Unknown column `{name}`.")
        key = f"__c{len(placeholders)}"
        placeholders[key] = name
        return key

    src = re.sub(r"`([^`]+)`", repl, expr)
    try:
        tree = ast.parse(src.strip(), mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Syntax error near column {exc.offset}: {exc.msg}.") from None

    n = len(df)

    def column(name: str) -> np.ndarray:
        s = df[name]
        out = pd.to_numeric(s, errors="coerce").to_numpy(dtype="float64")
        if np.isnan(out).all() and s.notna().any():
            raise ExpressionError(f"Column `{name}` is not numeric.")
        return out

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            return _BINOPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = ev(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.Compare) and len(node.ops) == 1 and type(node.ops[0]) in _CMPOPS:
            return _CMPOPS[type(node.ops[0])](ev(node.left), ev(node.comparators[0]))
        if isinstance(node, ast.Name):
            if node.id in placeholders:
                return column(placeholders[node.id])
            if node.id in df.columns:
                return column(node.id)
            if node.id in CONSTANTS:
                return CONSTANTS[node.id]
            raise ExpressionError(f"Unknown name '{node.id}'. Wrap column names in backticks.")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            fn = FUNCTIONS.get(node.func.id)
            if fn is None:
                raise ExpressionError(f"Function '{node.func.id}()' is not available.")
            if node.keywords:
                raise ExpressionError("Keyword arguments are not supported.")
            return fn(*[ev(a) for a in node.args])
        raise ExpressionError(f"'{ast.unparse(node)}' is not allowed in a formula.")

    with np.errstate(all="ignore"):
        result = ev(tree)
    result = np.asarray(result, dtype="float64")
    if result.ndim == 0:
        result = np.full(n, float(result))
    if result.shape != (n,):
        raise ExpressionError("The formula did not produce one value per row.")
    return result
