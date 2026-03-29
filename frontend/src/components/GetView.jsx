import AlluvialView from './AlluvialView'

export default function GetView(props) {
  return (
    <AlluvialView
      {...props}
      groupKey="realm"
      columnLabels={['Realm', 'Biome', 'EFG']}
    />
  )
}
