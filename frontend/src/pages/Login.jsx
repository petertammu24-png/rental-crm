import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl neu-btn-primary flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="label-eyebrow text-[#DA4FF1]">Rental CRM</div>
          <h1 className="font-display text-3xl mt-1 text-center text-white">
            Banglzz &amp; Kalyani Covering
          </h1>
          <p className="text-sm text-[#B097D1] mt-2 text-center">
            Branch-wise rental tracking, designed with grace.
          </p>
        </div>

        <div className="neu p-7">
          <h2 className="font-display text-xl text-white">Sign in</h2>
          <p className="text-xs text-[#B097D1] mt-1">Use your branch credentials</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <label className="label-eyebrow block">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@branch.com"
                className="neu-input w-full px-4 py-3 text-sm"
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <label className="label-eyebrow block">Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="neu-input w-full px-4 py-3 pr-12 text-sm"
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B097D1] hover:text-white"
                  data-testid="login-toggle-password"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="neu-btn-primary w-full py-3 text-sm font-semibold tracking-wide disabled:opacity-60"
              data-testid="login-submit-button"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#3D2A5C] text-[11px] text-[#B097D1] text-center">
            Default Super Admin: <span className="text-white">admin@jewel.com</span> / <span className="text-white">admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
