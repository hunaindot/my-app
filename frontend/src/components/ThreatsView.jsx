import AlluvialView from './AlluvialView'

export default function ThreatsView(props) {
  return (
    <AlluvialView
      {...props}
      groupKey="threats"
      columnLabels={['Threat Category', 'Sub-category']}
    />
  )
}
