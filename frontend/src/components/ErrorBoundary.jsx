import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center p-8 text-white font-body">
          <h1 className="text-xl font-bold text-white mb-3">Something went wrong</h1>
          <p className="text-white/60 text-sm mb-6 text-center max-w-md">
            We encountered an error. Try refreshing the page or going back home.
          </p>
          <Link
            to="/"
            className="px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors"
          >
            Back to home
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
