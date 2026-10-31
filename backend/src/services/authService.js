const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const userModel = require('../models/userModel')

const invalidCredentials = () => {
  const error = new Error('Username or password is incorrect.')
  error.status = 401
  error.codeName = 'INVALID_CREDENTIALS'
  return error
}

async function login(username, password) {
  const user = await userModel.findByUsername(username)
  if (!user || !user.is_active || !['FRONT_OFFICE', 'ADMIN'].includes(user.role)) {
    throw invalidCredentials()
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  if (!matches) throw invalidCredentials()

  const token = jwt.sign(
    { role: user.role },
    env.jwtSecret,
    { subject: String(user.id), expiresIn: env.jwtExpiresIn },
  )

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role },
  }
}

module.exports = { login }
