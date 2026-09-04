export function isTermuxEnvironment() {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux"))
}
