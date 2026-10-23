/** A small, safe calculator: numbers, + - * / ^ mod %, parentheses, constants and common functions. No eval. */

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot, atan2: Math.atan2,
  rad: (d) => (d * Math.PI) / 180, deg: (r) => (r * 180) / Math.PI,
  fact: (n) => factorial(n),
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 }

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial needs a whole number from 0 to 170.')
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) i++
    else if (/[\d.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i)
      if (!m) throw new Error(`Cannot read the number at "${s.slice(i, i + 8)}".`)
      out.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[a-z]/i.test(c)) {
      const m = s.slice(i).match(/^[a-z][a-z0-9]*/i)!
      out.push({ t: 'id', v: m[0].toLowerCase() })
      i += m[0].length
    } else if ('+-*/^%(),!'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else throw new Error(`Unexpected "${c}".`)
  }
  return out
}

export function evaluate(src: string): number {
  const toks = tokenize(src)
  let p = 0
  const isOp = (v: string) => toks[p]?.t === 'op' && toks[p].v === v
  const isWord = (v: string) => toks[p]?.t === 'id' && toks[p].v === v

  function expr(): number {
    let v = term()
    while (isOp('+') || isOp('-')) v = toks[p++].v === '+' ? v + term() : v - term()
    return v
  }
  function term(): number {
    let v = unary()
    for (;;) {
      if (isOp('*')) (p++, (v *= unary()))
      else if (isOp('/')) (p++, (v /= unary()))
      else if (isWord('mod')) (p++, (v %= unary()))
      else return v
    }
  }
  function unary(): number {
    if (isOp('-')) return (p++, -unary())
    if (isOp('+')) return (p++, unary())
    return power()
  }
  function power(): number {
    const base = postfix()
    return isOp('^') ? (p++, Math.pow(base, unary())) : base
  }
  function postfix(): number {
    let v = primary()
    for (;;) {
      if (isOp('%')) (p++, (v /= 100))
      else if (isOp('!')) (p++, (v = factorial(v)))
      else return v
    }
  }
  function primary(): number {
    const t = toks[p++]
    if (!t) throw new Error('The expression ends too soon.')
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '(') {
      const v = expr()
      if (!isOp(')')) throw new Error('Missing a closing parenthesis.')
      p++
      return v
    }
    if (t.t === 'id') {
      if (t.v in CONSTS) return CONSTS[t.v]
      const fn = FUNCS[t.v]
      if (!fn) throw new Error(`Unknown word "${t.v}".`)
      if (!isOp('(')) throw new Error(`${t.v} needs brackets, like ${t.v}(2).`)
      p++
      const args: number[] = []
      if (!isOp(')')) {
        args.push(expr())
        while (isOp(',')) (p++, args.push(expr()))
      }
      if (!isOp(')')) throw new Error('Missing a closing parenthesis.')
      p++
      return fn(...args)
    }
    throw new Error(`Unexpected "${t.v}".`)
  }

  const v = expr()
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}".`)
  if (!Number.isFinite(v)) throw new Error(Number.isNaN(v) ? 'That has no real answer.' : 'That is infinite (division by zero?).')
  return v
}

/** 1234567.891 → "1,234,567.891"; very large and small numbers use exponents. */
export function formatNumber(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-9) {
    const [m, e] = n.toExponential(8).split('e')
    return `${m.replace(/\.?0+$/, '')} × 10^${Number(e)}`
  }
  return Number(n.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 })
}
