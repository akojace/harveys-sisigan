// src/pages/LoginPage.jsx

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, Input } from '../components/ui'

import wall1 from '../assets/LOGO/wall1.jpg'
import logo from '../assets/LOGO/logo.jpg'

export default function LoginPage() {

  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('cashier1@sisigan.ph')
  const [password, setPassword] = useState('cashier123')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [isMobile, setIsMobile] = useState(
    window.innerWidth < 768
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError('')

    try {
      const loggedInUser = await login(email, password)

      if (loggedInUser?.role === 'CASHIER') {
        navigate('/dashboard')
      } else {
        navigate('/dashboard')
      }

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (

    <div
      style={{  
        minHeight: '100vh',
        width: '100%',
        overflowX: 'hidden',
        background: 'linear-gradient(135deg, #d97706 0%, #d78b34 55%, #ffac4c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 24
      }}
    >

      {/* MAIN LOGIN CONTAINER */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          width: '100%',
          minWidth: 0,
          maxWidth: isMobile ? 450 : 950,
          minHeight: isMobile ? 'auto' : 600,
          overflow: 'hidden',
          borderRadius: 30,
          margin: '0 auto',
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.18)',
          background: '#FFF9F3'
        }}
      >
        {/* =======================================LEFT SIDE — BRAND SECTION======================================= */}
        {!isMobile && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: 'linear-gradient(160deg, #d1690f 0%, #D97706 55%, #F0A500 100%)',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: isMobile ? 30 : 60,
              textAlign: 'center'
            }}
          >
            {/*logo*/}
            <img
              src={logo}
              alt="logo"
              style={{
                width: isMobile ? 90 : 150,
                height: isMobile ? 90 : 150,
                objectFit: 'cover',
                borderRadius: 20,
                boxShadow:
                  '0 12px 40px rgba(0,0,0,.18)',
                border:
                  '4px solid rgba(255,255,255,.28)',
                marginBottom: 30
              }}
            />
            <h1
              style={{
                fontFamily: 'Georgia',
                fontSize: isMobile ? 24 : 38,
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: 10
              }}
            >
              Harvey's Special
              <br />
              Crispy Sisig
            </h1>
            <p
              style={{
                opacity: .8, fontSize: 14, letterSpacing: -.8, textShadow: '0 2px 6px rgba(0,0,0,.18)'
              }}
            >
              Point of Sale System
            </p>
            {/* added feature indicators */}
            {/* <div
            style={{
              marginTop: 40,fontSize: 13,opacity: .7,lineHeight: 2
            }}
          >
            ✓ Inventory Tracking
            <br />
            ✓ Sales Analytics
            <br />
            ✓ Faster Transactions
          </div> */}
          </div>
        )}

        {/* =======================================RIGHT SIDE — LOGIN FORM======================================= */}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            background:'#FFFDF8',
            padding: isMobile ? '30px 20px' : '70px 55px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <div style={{ marginBottom: 30 }}>
            <h2
              style={{
                fontSize: isMobile ? 24 : 34,
                marginBottom: 8, color: '#cd6f04', fontWeight: 700
              }}
            >
              WELCOME!
            </h2>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 14
              }}
            >
              Sign in to continue
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div
              style={{
                background: 'var(--red-light)', color: 'var(--red-dark)', padding: 14, borderRadius: 14, marginBottom: 20, fontSize: 13
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 16
            }}
          >
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              onKeyDown={e =>
                e.key === 'Enter' &&
                handleLogin()
              }
            />

            {/*forgot password */}
            <div
              style={{
                textAlign: 'right'
              }}
            >
              <Link
                to="/forgot-password"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--brown-600)',
                  textDecoration: 'none',
                  opacity: .85
                }}
              >
                Forgot password?
              </Link>
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              onClick={handleLogin}
              style={{
                marginTop: 8,
                height: 54,
                borderRadius: 14,
                fontWeight: 700,
                background: '#cd6f04',
                boxShadow:
                  '0 10px 28px #91400d38'
              }}
            >

              {loading
                ? 'Signing in...'
                : 'Sign In'}

            </Button>

          </div>

          {/* =======================================DEV ACCOUNTS======================================= */}
          {/* CHANGE: collapsed so it doesn't compete with login action*/}
          {/* <details
            style={{
              marginTop: 32
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-muted)'
              }}
            >
              Development Accounts
            </summary>
            <div
              style={{
                marginTop: 10,
                padding: 14,
                background:
                  'rgba(170,90,20,.08)',
                border:
                  '1px solid rgba(170,90,20,.12)',
                borderRadius: 14,
                fontSize: 12,
                lineHeight: 2
              }}
            >
              owner@sisigan.ph / owner123
              <br />
              manager@sisigan.ph / manager123
              <br />
              cashier1@sisigan.ph / cashier123
            </div>
          </details> */}

        </div>
      </div>
    </div>
  )
}