"use strict";

/* ============ Estado ============ */
const state = {
  expr: "",
  evaluated: false,
  deg: true,   // true = grados, false = radianes
  inv: false,  // funciones inversas
};

const exprEl = document.getElementById("expr");
const resultEl = document.getElementById("result");
const flagInv = document.getElementById("flag-inv");
const flagMode = document.getElementById("flag-mode");
const btnMode = document.getElementById("btn-mode");
const invBtn = document.querySelector('[data-action="inv"]');

/* ============ Evaluador (sin eval) ============ */
const FUNCS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "√"]);

function tokenize(str) {
  const re = /(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|asin|acos|atan|sin|cos|tan|log|ln|√|π|e|[+\-−×÷*\/^!%()])/y;
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    re.lastIndex = i;
    const m = re.exec(str);
    if (!m) throw new Error("Sintaxis incorrecta");
    let t = m[1];
    if (t === "−") t = "-";
    if (t === "*") t = "×";
    if (t === "/") t = "÷";
    tokens.push(t);
    i = re.lastIndex;
  }
  return tokens;
}

const toRad = (a) => (state.deg ? (a * Math.PI) / 180 : a);
const fromRad = (a) => (state.deg ? (a * 180) / Math.PI : a);
const zap = (x) => (Math.abs(x) < 1e-15 ? 0 : x);

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("n! solo para enteros de 0 a 170");
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function applyFunc(name, a) {
  switch (name) {
    case "sin": return zap(Math.sin(toRad(a)));
    case "cos": return zap(Math.cos(toRad(a)));
    case "tan": {
      if (Math.abs(Math.cos(toRad(a))) < 1e-15) throw new Error("tan indefinida");
      return zap(Math.tan(toRad(a)));
    }
    case "asin":
      if (Math.abs(a) > 1) throw new Error("Fuera de dominio");
      return fromRad(Math.asin(a));
    case "acos":
      if (Math.abs(a) > 1) throw new Error("Fuera de dominio");
      return fromRad(Math.acos(a));
    case "atan": return fromRad(Math.atan(a));
    case "log":
      if (a <= 0) throw new Error("Fuera de dominio");
      return Math.log10(a);
    case "ln":
      if (a <= 0) throw new Error("Fuera de dominio");
      return Math.log(a);
    case "√":
      if (a < 0) throw new Error("Raíz de número negativo");
      return Math.sqrt(a);
  }
  throw new Error("Función desconocida");
}

function evaluate(str) {
  const t = tokenize(str);
  let p = 0;
  const peek = () => t[p];
  const next = () => t[p++];
  const isNum = (x) => x !== undefined && /^[\d.]/.test(x);
  const startsOperand = (x) =>
    x !== undefined && (isNum(x) || FUNCS.has(x) || x === "π" || x === "e" || x === "(");

  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  function term() {
    let v = unary();
    for (;;) {
      const x = peek();
      if (x === "×") { next(); v *= unary(); }
      else if (x === "÷") {
        next();
        const d = unary();
        if (d === 0) throw new Error("División por cero");
        v /= d;
      }
      else if (startsOperand(x)) { v *= unary(); } // multiplicación implícita: 2π, 3(4)
      else break;
    }
    return v;
  }

  function unary() {
    if (peek() === "-") { next(); return -unary(); }
    if (peek() === "+") { next(); return unary(); }
    return power();
  }

  function power() {
    const base = postfix();
    if (peek() === "^") {
      next();
      return Math.pow(base, unary());
    }
    return base;
  }

  function postfix() {
    let v = primary();
    while (peek() === "!" || peek() === "%") {
      v = next() === "!" ? factorial(v) : v / 100;
    }
    return v;
  }

  function closeParen() {
    if (peek() === ")") next();
    else if (peek() !== undefined) throw new Error("Sintaxis incorrecta");
    // si llegamos al final, cerramos el paréntesis automáticamente
  }

  function primary() {
    const x = next();
    if (x === undefined) throw new Error("Expresión incompleta");
    if (isNum(x)) return parseFloat(x);
    if (x === "π") return Math.PI;
    if (x === "e") return Math.E;
    if (x === "(") {
      const v = expr();
      closeParen();
      return v;
    }
    if (FUNCS.has(x)) {
      if (next() !== "(") throw new Error("Falta ( después de la función");
      const v = expr();
      closeParen();
      return applyFunc(x, v);
    }
    throw new Error("Sintaxis incorrecta");
  }

  const value = expr();
  if (p < t.length) throw new Error("Sintaxis incorrecta");
  return value;
}

function format(x) {
  if (!Number.isFinite(x)) throw new Error("Resultado no válido");
  x = parseFloat(x.toPrecision(12));
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e12 || a < 1e-6) return x.toExponential();
  return String(x);
}

/* ============ Pantalla ============ */
function render(historyText) {
  exprEl.textContent = historyText || state.expr;
  resultEl.classList.remove("is-error", "is-preview");

  if (!state.expr) {
    resultEl.textContent = "0";
  } else if (state.evaluated) {
    resultEl.textContent = state.expr;
  } else {
    try {
      resultEl.textContent = format(evaluate(state.expr));
      resultEl.classList.add("is-preview");
    } catch {
      resultEl.textContent = "";
    }
  }
  exprEl.scrollLeft = exprEl.scrollWidth;
}

/* ============ Acciones ============ */
function insert(token) {
  if (state.evaluated) {
    // Si sigue un operador, continuamos con el resultado; si no, empezamos de nuevo
    if (!/^[+−×÷^!%]/.test(token)) state.expr = "";
    state.evaluated = false;
  }
  state.expr += token;
  render();
}

function clearAll() {
  state.expr = "";
  state.evaluated = false;
  render();
}

function deleteLast() {
  if (state.evaluated) return clearAll();
  state.expr = state.expr.replace(/(asin\(|acos\(|atan\(|sin\(|cos\(|tan\(|log\(|ln\(|√\(|.)$/, "");
  render();
}

function equals() {
  if (!state.expr || state.evaluated) return;
  const original = state.expr;
  try {
    const result = format(evaluate(original));
    state.expr = result;
    state.evaluated = true;
    render(original + " =");
  } catch (err) {
    exprEl.textContent = original;
    resultEl.textContent = err.message;
    resultEl.classList.remove("is-preview");
    resultEl.classList.add("is-error");
  }
}

function toggleMode() {
  state.deg = !state.deg;
  const label = state.deg ? "DEG" : "RAD";
  btnMode.textContent = label;
  flagMode.textContent = label;
  render();
}

function setInv(on) {
  state.inv = on;
  invBtn.classList.toggle("is-on", on);
  invBtn.setAttribute("aria-pressed", String(on));
  flagInv.classList.toggle("flag-on", on);
  document.querySelectorAll("[data-inv-v]").forEach((btn) => {
    btn.textContent = on ? btn.dataset.invLabel : btn.dataset.label;
  });
}

/* ============ Eventos: clic en teclas ============ */
document.querySelector(".keys").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "ac") return clearAll();
  if (action === "del") return deleteLast();
  if (action === "eq") return equals();
  if (action === "mode") return toggleMode();
  if (action === "inv") return setInv(!state.inv);

  if (btn.dataset.invV) {
    insert(state.inv ? btn.dataset.invV : btn.dataset.v);
    if (state.inv) setInv(false);
    return;
  }
  insert(btn.dataset.v);
});

/* ============ Eventos: teclado físico ============ */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;

  if (/^[0-9.()+^!%]$/.test(k)) { insert(k); e.preventDefault(); }
  else if (k === "-") { insert("−"); e.preventDefault(); }
  else if (k === "*") { insert("×"); e.preventDefault(); }
  else if (k === "/") { insert("÷"); e.preventDefault(); }
  else if (k === "Enter" || k === "=") { equals(); e.preventDefault(); }
  else if (k === "Backspace") { deleteLast(); e.preventDefault(); }
  else if (k === "Escape") { clearAll(); e.preventDefault(); }
});

render();