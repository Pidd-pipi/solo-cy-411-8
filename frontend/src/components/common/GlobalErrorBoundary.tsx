import { Component, ReactNode } from 'react';
import { Alert } from 'antd';

interface State {
  error?: Error;
}

export class GlobalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <Alert type="error" message="页面渲染失败" description={this.state.error.message} showIcon />;
    }
    return this.props.children;
  }
}
