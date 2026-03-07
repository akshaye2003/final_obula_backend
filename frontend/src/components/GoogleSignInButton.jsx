import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function GoogleButtonInner({ onSuccess, onError, children }) {
  return (
    <GoogleLogin
      onSuccess={(credentialResponse) => {
        const cred = credentialResponse?.credential;
        if (cred) onSuccess?.(cred);
      }}
      onError={onError}
      use_fedcm_for_prompt
      theme="filled_black"
      size="large"
      text="continue_with"
      shape="rectangular"
    />
  );
}

export default function GoogleSignInButton({ onSuccess, onError, onDevLogin }) {
  if (!CLIENT_ID) {
    return (
      onDevLogin ? (
        <button
          type="button"
          onClick={onDevLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-black font-semibold hover:bg-zinc-200 transition"
        >
          Continue
        </button>
      ) : (
        <p className="text-center text-zinc-500 text-sm">Configure VITE_GOOGLE_CLIENT_ID for sign-in</p>
      )
    );
  }

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <GoogleButtonInner onSuccess={onSuccess} onError={onError} />
    </GoogleOAuthProvider>
  );
}
