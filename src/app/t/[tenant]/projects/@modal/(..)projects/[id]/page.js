import ProjectModal from '@components/ProjectModal'

export default function ProjectModalInterceptedPage({ params }) {
  return <ProjectModal projectId={params.id} tenantSlug={params.tenant} />
}
