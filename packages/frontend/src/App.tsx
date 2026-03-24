import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Players from '@/pages/Players'
import Seasons from '@/pages/Seasons'
import SeasonDetail from '@/pages/SeasonDetail'
import NewGame from '@/pages/NewGame'
import Game from '@/pages/Game'
import GameHistory from '@/pages/GameHistory'
import Stats from '@/pages/Stats'
import StatsAllTime from '@/pages/StatsAllTime'
import PlayerStats from '@/pages/PlayerStats'
import Admin from '@/pages/Admin'
import Settings from '@/pages/Settings'
import Register from '@/pages/Register'
import VerifyEmail from '@/pages/VerifyEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import PickGroup from '@/pages/PickGroup'
import Join from '@/pages/Join'
import TournamentList from './pages/TournamentList'
import TournamentNew from './pages/TournamentNew'
import TournamentDetail from './pages/TournamentDetail'

function AppRoot() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppRoot />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pick-group" element={<PickGroup />} />
      <Route path="/join" element={<Join />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/players"
        element={
          <ProtectedRoute>
            <Layout>
              <Players />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/seasons"
        element={
          <ProtectedRoute>
            <Layout>
              <Seasons />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/seasons/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <SeasonDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/seasons/:seasonId/games/new"
        element={
          <ProtectedRoute>
            <Layout>
              <NewGame />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <Game />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:id/history"
        element={
          <ProtectedRoute>
            <Layout>
              <GameHistory />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Layout>
              <Stats />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats/alltime"
        element={
          <ProtectedRoute>
            <Layout>
              <StatsAllTime />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats/players/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <PlayerStats />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tournaments"
        element={
          <ProtectedRoute>
            <Layout>
              <TournamentList />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tournaments/new"
        element={
          <ProtectedRoute>
            <Layout>
              <TournamentNew />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tournaments/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <TournamentDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
