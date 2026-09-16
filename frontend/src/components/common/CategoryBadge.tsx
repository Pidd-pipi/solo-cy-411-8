import { Tag } from 'antd';
import { ActivityCategory, ACTIVITY_CATEGORY_COLORS } from '../../constants/activity';
import { formatActivityCategory } from '../../utils/formatters';

export function CategoryBadge({ category }: { category: ActivityCategory }) {
  return <Tag color={ACTIVITY_CATEGORY_COLORS[category]}>{formatActivityCategory(category)}</Tag>;
}

