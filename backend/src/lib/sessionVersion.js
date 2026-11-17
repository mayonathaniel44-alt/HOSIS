function isSessionVersionCurrent(tokenVersion, accountVersion) {
  return Number.isInteger(tokenVersion)
    && Number.isInteger(accountVersion)
    && tokenVersion === accountVersion
}

module.exports = { isSessionVersionCurrent }
