import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="management-heading"><div><span className="management-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="management-heading-action">{action}</div>}</div>;
}

export function IntegrationPending({ children = "Esta consulta depende de um endpoint de leitura que ainda não está disponível na API." }: { children?: ReactNode }) {
  return <div className="integration-pending" role="status"><span className="pending-dot" /><div><strong>Integração pendente</strong><p>{children}</p></div></div>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state-mark"><Icon name="search" size={22} /></span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

export function ButtonLink({ href, children, secondary = false, icon }: { href: string; children: ReactNode; secondary?: boolean; icon?: IconName }) {
  return <Link className={`management-button ${secondary ? "management-button-secondary" : ""}`} to={href}>{icon && <Icon name={icon} size={17} />}{children}</Link>;
}

export function LoadingState({ label = "Carregando informações" }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-state" role="alert"><Icon name="warning" size={20} /><div><strong>Não foi possível carregar</strong><p>{message}</p><button type="button" className="management-button management-button-secondary" onClick={onRetry}><Icon name="refresh" size={16} /> Tentar novamente</button></div></div>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const state = ["ativo", "ativa", "paga", "concluido", "aprovado"].includes(normalized) ? "positive" : /pendente|aguardando/.test(normalized) ? "pending" : /encerrad|inativ|cancelad|rejeitad/.test(normalized) ? "muted" : "neutral";
  return <span className={`status-badge status-${state}`}><span aria-hidden="true" />{status}</span>;
}
