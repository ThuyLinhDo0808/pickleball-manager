// A number in a table or list: right-aligned, equal-width digits; null / undefined / ''
// shows a grey "—" (a real 0 is printed). `format` turns the value into text.
export default function Num({ value, format, className = '', as: Tag = 'span' }) {
  const empty = value === null || value === undefined || value === '' || Number.isNaN(value);
  return <Tag className={`num ${className}`}>{empty ? null : format ? format(value) : value}</Tag>;
}
