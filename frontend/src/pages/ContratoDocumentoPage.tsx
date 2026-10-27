import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, getContrato, type ContratoDetail } from "../api";
import { ContratoDocumento } from "../components/ContratoDocumento";
import { ErrorState, LoadingState, PageHeader } from "../components/PagePrimitives";
import { Icon } from "../components/Icon";

export default function ContratoDocumentoPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [contract, setContract] = useState<ContratoDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getContrato(id).then((result) => { if (active) setContract(result); })
      .catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "Contrato não encontrado." : "Não foi possível carregar os dados persistidos do contrato."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, refresh]);
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
    <PageHeader eyebrow="CONTRATOS / DOCUMENTO" title={contract ? `Contrato nº ${contract.numero_contrato}` : "Documento contratual"} description="Prévia preenchida com dados persistidos do acolhido, responsável e contrato." action={<div className="contract-actions no-print"><Link className="management-button management-button-secondary" to={contract ? `/contratos/${contract.id}` : "/contratos"}><Icon name="arrow" size={16} /> Voltar</Link><button className="management-button management-button-secondary" disabled={!contract} onClick={openPrintDialog}><Icon name="print" size={16} /> Imprimir</button><button className="management-button" disabled={!contract} onClick={openPrintDialog}><Icon name="download" size={16} /> Salvar como PDF</button></div>} />
    <div className="contract-print-help no-print">Para baixar o PDF, escolha <strong>Salvar como PDF</strong> no destino da janela de impressão. Os botões e menus não aparecem no documento impresso.</div>
    {loading && <div className="no-print"><LoadingState label="Carregando documento..." /></div>}
    {error && <div className="no-print"><ErrorState message={error} onRetry={() => setRefresh(value => value + 1)} /></div>}
    {contract && <ContratoDocumento contrato={contract} />}
  </div>;
}
