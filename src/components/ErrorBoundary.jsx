import { Component } from 'react';

// Catches any unhandled render error so the app shows a readable message and a
// recovery button instead of a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface details in the console for debugging.
    console.error('App crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="centered-screen">
          <div className="card">
            <div className="big-check" style={{ background: '#fde8e8', color: '#dc2626' }} aria-hidden>
              !
            </div>
            <h2>אירעה שגיאה בפתיחת המסמך</h2>
            <p className="muted">
              ייתכן שהקובץ גדול מדי, פגום או מוגן בסיסמה. אפשר לנסות שוב, או לבחור קובץ אחר.
            </p>
            <button
              className="btn-primary full"
              onClick={() => {
                this.setState({ error: null });
                location.reload();
              }}
            >
              רענן ונסה שוב
            </button>
          </div>
        </div>
      </div>
    );
  }
}
