import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="management-heading"><div><span className="management-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="management-heading-action">{action}</div>}</div>;
}

export function IntegrationPending({ children = "Esta consulta depende de um endpoint de leitura que ainda não está disponível na API." }: { children?: ReactNode }) {
  return <div className="integration-pending" role="status"><span className="pending-dot" /><div><strong>Integração pendente</strong><p>{children}</p></div></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-state-mark" aria-hidden="true">○</span><strong>{title}</strong><p>{detail}</p></div>;
}

export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`management-button ${secondary ? "management-button-secondary" : ""}`} to={href}>{children}</Link>;
}
