import React from "react";
import ReactDOM from "react-dom/client";
import App from "./GithubConnectedApp";
import "./tailwind.css";

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            margin: "32px auto",
            width: "min(920px, calc(100% - 48px))",
            padding: "24px",
            borderRadius: "20px",
            background: "#fff4f3",
            border: "1px solid #e7c1bc",
            color: "#7d3027",
            fontFamily: "Pretendard, Noto Sans KR, sans-serif",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong style={{ display: "block", marginBottom: "8px" }}>
            프론트 렌더링 오류
          </strong>
          화면을 그리는 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요.
          <div style={{ marginTop: "12px", fontSize: "13px", lineHeight: 1.6 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          {this.state.error?.stack ? (
            <pre style={{ marginTop: "12px", overflowX: "auto", fontSize: "11px", lineHeight: 1.5 }}>
              {this.state.error.stack}
            </pre>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
