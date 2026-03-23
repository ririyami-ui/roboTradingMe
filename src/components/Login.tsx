import React from 'react';

interface LoginProps {
    onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px]"></div>

            <div className="relative z-10 w-full max-w-md p-8 bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-3xl shadow-2xl text-center">
                <div className="mb-8">
                    <div className="w-20 h-20 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4 transform -rotate-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">SaktiBot<span className="text-cyan-400">Trade</span></h1>
                    <p className="text-gray-400 mt-2">Precision Scalping & Portfolio Management</p>
                </div>

                <button
                    onClick={onLogin}
                    className="group relative w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/5"
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                    Sign in with Google
                    <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-cyan-400/30 transition-colors"></div>
                </button>

                <div className="mt-8 flex items-center justify-center gap-6">
                    <div className="flex flex-col items-center">
                        <span className="text-cyan-400 font-bold text-xl">AI</span>
                        <span className="text-gray-500 text-[10px] uppercase tracking-widest leading-none">Powered</span>
                    </div>
                    <div className="w-px h-8 bg-gray-800"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-purple-400 font-bold text-xl">24/7</span>
                        <span className="text-gray-500 text-[10px] uppercase tracking-widest leading-none">Scanning</span>
                    </div>
                </div>

                <p className="mt-10 text-xs text-gray-500 uppercase tracking-widest">
                    Secured by Firebase Auth
                </p>
            </div>

            {/* Decorative Grid */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
        </div>
    );
};

export default Login;
