import { Empty } from 'antd';

export function EmptyState({ text = '暂无数据' }: { text?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

