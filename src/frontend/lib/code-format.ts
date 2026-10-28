// "ABCDEF" as "ABC DEF": two groups of three are easier to read out and type.
export function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
