import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, getContrato, type ContratoDetail } from "../api";
import { ContratoDocumento } from "../components/ContratoDocumento";
import { PageHeader } from "../components/PagePrimitives";

export default function ContratoDocumentoPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [contract, setContract] = useState<ContratoDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getContrato(id).then((result) => { if (active) setContract(result); })
      .catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "Contrato não encontrado." : "Não foi possível carregar os dados persistidos do contrato."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!contract || params.get("imprimir") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [contract, params]);

  function openPrintDialog() {
    if (!contract) return;
    const priorTitle = document.title;
    document.title = `Contrato-Atrio-${contract.numero_contrato}`;
    window.addEventListener("afterprint", () => { document.title = priorTitle; }, { once: true });
    window.print();
  }

  return <div className="contract-view-page">
    <PageHeader eyebrow="CONTRATOS / DOCUMENTO" title={contract ? `Contrato nº ${contract.numero_contrato}` : "Documento contratual"} description="Prévia preenchida com dados persistidos do acolhido, responsável e contrato." action={<div className="contract-actions no-print"><Link className="management-button management-button-secondary" to={contract ? `/contratos/${contract.id}` : "/contratos"}>Voltar</Link><button className="management-button management-button-secondary" disabled={!contract} onClick={openPrintDialog}>Imprimir contrato</button><button className="management-button" disabled={!contract} onClick={openPrintDialog}>Baixar contrato em PDF</button></div>} />
    <div className="contract-print-help no-print">Para baixar o PDF, escolha <strong>Salvar como PDF</strong> no destino da janela de impressão. Os botões e menus não aparecem no documento impresso.</div>
    {loading && <p className="no-print" role="status">Carregando dados persistidos…</p>}
    {error && <div className="integration-pending no-print" role="alert"><div><strong>Documento indisponível</strong><p>{error}</p></div></div>}
    {contract && <ContratoDocumento contrato={contract} />}
  </div>;
}
