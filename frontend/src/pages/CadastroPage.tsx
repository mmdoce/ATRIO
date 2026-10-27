import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  createCadastro,
  getApiHealth,
  previewFirstDue,
  type CadastroPayload,
  type CadastroResponse,
} from "../api";
import {
  addThirtyCalendarDays,
  digits,
  formatBrl,
  formatCep,
  formatCpf,
  formatDate,
  formatPhone,
  isValidCpf,
  parseBrlToCents,
} from "../format";

type PersonSide = "aluno" | "responsavel_financeiro";
type PersonForm = {
  nome: string;
  rg: string;
  cpf: string;
  data_nascimento?: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
};
type ContractForm = {
  data_contrato: string;
  tipo_vaga: "SOCIAL" | "PARTICULAR";
  mensalidade_valor: string;
  cobrar_matricula: boolean;
  matricula_valor: string;
  vencimento_dia: string;
};
type CadastroForm = {
  aluno: PersonForm;
  responsavel_financeiro: PersonForm;
  contrato: ContractForm;
};
type FormErrors = Record<string, string>;
type Step = "form" | "review" | "success";
type PreviewStatus = "idle" | "loading" | "confirmed" | "offline";

const stateOptions = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyPerson(withBirthDate: boolean): PersonForm {
  return {
    nome: "",
    rg: "",
    cpf: "",
    ...(withBirthDate ? { data_nascimento: "" } : {}),
    telefone: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  };
}

function initialForm(): CadastroForm {
  return {
    aluno: emptyPerson(true),
    responsavel_financeiro: emptyPerson(false),
    contrato: {
      data_contrato: todayLocal(),
      tipo_vaga: "SOCIAL",
      mensalidade_valor: "",
      cobrar_matricula: false,
      matricula_valor: "",
      vencimento_dia: "10",
    },
  };
}

function validateForm(form: CadastroForm): FormErrors {
  const errors: FormErrors = {};
  const people: [PersonSide, PersonForm][] = [
    ["aluno", form.aluno],
    ["responsavel_financeiro", form.responsavel_financeiro],
  ];

  for (const [side, person] of people) {
    const label = side === "aluno" ? "acolhido" : "responsável";
    const requiredFields: (keyof PersonForm)[] = [
      "nome", "rg", "cpf", "telefone", "cep", "endereco", "numero", "bairro", "cidade", "estado",
    ];
    for (const key of requiredFields) {
      if (!String(person[key] ?? "").trim()) {
        errors[`${side}.${key}`] = "Campo obrigatório.";
      }
    }
    if (person.nome.trim() && person.nome.trim().length < 2) errors[`${side}.nome`] = "Informe o nome completo.";
    if (person.nome.trim().length > 160) errors[`${side}.nome`] = "Use até 160 caracteres.";
    if (person.endereco.trim() && person.endereco.trim().length < 2) errors[`${side}.endereco`] = "Informe um endereço válido.";
    if (person.bairro.trim() && person.bairro.trim().length < 2) errors[`${side}.bairro`] = "Informe um bairro válido.";
    if (person.cidade.trim() && person.cidade.trim().length < 2) errors[`${side}.cidade`] = "Informe uma cidade válida.";
    if (person.rg.trim().length > 30) errors[`${side}.rg`] = "Use até 30 caracteres.";
    if (person.cpf.trim() && !isValidCpf(person.cpf)) errors[`${side}.cpf`] = "Confira o CPF informado.";
    const phoneLength = digits(person.telefone).length;
    if (person.telefone.trim() && phoneLength !== 10 && phoneLength !== 11) {
      errors[`${side}.telefone`] = `Informe um telefone válido para ${label}.`;
    }
    if (person.cep.trim() && digits(person.cep).length !== 8) errors[`${side}.cep`] = "Informe um CEP com 8 números.";
    if (person.data_nascimento !== undefined) {
      if (!person.data_nascimento) errors[`${side}.data_nascimento`] = "Informe a data de nascimento.";
      else if (person.data_nascimento >= todayLocal()) errors[`${side}.data_nascimento`] = "A data deve ser anterior a hoje.";
      if (person.data_nascimento && person.data_nascimento >= form.contrato.data_contrato) {
        errors[`${side}.data_nascimento`] = "O nascimento deve ser anterior à data do contrato.";
      }
    }
  }

  const contract = form.contrato;
  if (!contract.data_contrato) errors["contrato.data_contrato"] = "Informe a data do contrato.";
  else if (contract.data_contrato > todayLocal()) errors["contrato.data_contrato"] = "A data não pode estar no futuro.";
  if (!contract.tipo_vaga) errors["contrato.tipo_vaga"] = "Selecione o tipo de vaga.";

  const monthlyCents = parseBrlToCents(contract.mensalidade_valor);
  if (monthlyCents === null || monthlyCents <= 0) {
    errors["contrato.mensalidade_valor"] = "Informe um valor entre R$ 0,01 e R$ 99.999.999,99, com até duas casas decimais.";
  }
  if (contract.cobrar_matricula) {
    const enrollmentCents = parseBrlToCents(contract.matricula_valor);
    if (enrollmentCents === null || enrollmentCents <= 0) {
      errors["contrato.matricula_valor"] = "Informe um valor positivo, com até duas casas decimais.";
    }
  }
  const dueDay = Number(contract.vencimento_dia);
  if (!contract.vencimento_dia || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    errors["contrato.vencimento_dia"] = "Informe um dia entre 1 e 31.";
  }
  return errors;
}

function toPayload(form: CadastroForm): CadastroPayload {
  const mapPerson = (person: PersonForm) => ({
    nome: person.nome.trim(),
    rg: person.rg.trim(),
    cpf: digits(person.cpf),
    telefone: digits(person.telefone),
    cep: digits(person.cep),
    endereco: [person.endereco.trim(), person.numero.trim(), person.complemento.trim()]
      .filter(Boolean)
      .join(", "),
    bairro: person.bairro.trim(),
    cidade: person.cidade.trim(),
    estado: person.estado.toUpperCase(),
  });
  const monthlyCents = parseBrlToCents(form.contrato.mensalidade_valor) ?? 0;
  const enrollmentCents = form.contrato.cobrar_matricula
    ? parseBrlToCents(form.contrato.matricula_valor) ?? 0
    : 0;
  return {
    aluno: {
      ...mapPerson(form.aluno),
      data_nascimento: form.aluno.data_nascimento ?? "",
    },
    responsavel_financeiro: mapPerson(form.responsavel_financeiro),
    contrato: {
      data_contrato: form.contrato.data_contrato,
      tipo_vaga: form.contrato.tipo_vaga,
      mensalidade_valor: (monthlyCents / 100).toFixed(2),
      matricula_valor: (enrollmentCents / 100).toFixed(2),
      cobrar_matricula: form.contrato.cobrar_matricula,
      vencimento_dia: Number(form.contrato.vencimento_dia),
    },
  };
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "home") return <svg {...shared}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></svg>;
  if (name === "people") return <svg {...shared}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13a5.5 5.5 0 0 1 5.5 5.5V20zM16 5.2a3 3 0 0 1 0 5.7M17 13a5.5 5.5 0 0 1 3.5 5.2V20h-3" /></svg>;
  if (name === "file") return <svg {...shared}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h8" /></svg>;
  if (name === "chart") return <svg {...shared}><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
  if (name === "settings") return <svg {...shared}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-1 -1) scale(.95)" /></svg>;
  if (name === "help") return <svg {...shared}><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.3c-.8 1.1-2.2 1.4-2.2 3M12 17.3h.01" /></svg>;
  if (name === "calendar") return <svg {...shared}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></svg>;
  if (name === "check") return <svg {...shared}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "arrow") return <svg {...shared}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "shield") return <svg {...shared}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg>;
  return <svg {...shared}><circle cx="12" cy="12" r="9" /></svg>;
}

function InputField({
  id, label, error, hint, required = true, children,
}: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={id}>{label}{required && <span className="required-mark"> *</span>}</label>
      {children}
      {error && <span className="field-message" id={`${id}-error`}>{error}</span>}
      {!error && hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export default function CadastroPage({ onCreated }: { onCreated: (result: CadastroResponse) => void }) {
  const [form, setForm] = useState<CadastroForm>(initialForm);
  const [step, setStep] = useState<Step>("form");
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [apiDueDate, setApiDueDate] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CadastroResponse | null>(null);

  const firstDueLocal = useMemo(
    () => addThirtyCalendarDays(form.contrato.data_contrato),
    [form.contrato.data_contrato],
  );
  const monthlyCents = parseBrlToCents(form.contrato.mensalidade_valor) ?? 0;
  const enrollmentCents = form.contrato.cobrar_matricula
    ? parseBrlToCents(form.contrato.matricula_valor) ?? 0
    : 0;
  const totalInitialCents = monthlyCents + enrollmentCents;

  useEffect(() => {
    let current = true;
    getApiHealth()
      .then(() => { if (current) setApiOnline(true); })
      .catch(() => { if (current) setApiOnline(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    const dueDate = addThirtyCalendarDays(form.contrato.data_contrato);
    setApiDueDate(null);
    if (!form.contrato.data_contrato || form.contrato.data_contrato > todayLocal() || !dueDate) {
      setPreviewStatus("idle");
      return () => { current = false; };
    }
    setPreviewStatus("loading");
    const timer = window.setTimeout(() => {
      previewFirstDue(form.contrato.data_contrato)
        .then((response) => {
          if (!current) return;
          setApiDueDate(response.primeiro_vencimento);
          setPreviewStatus("confirmed");
        })
        .catch(() => {
          if (!current) return;
          setPreviewStatus("offline");
        });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [form.contrato.data_contrato]);

  function updatePerson(side: PersonSide, key: keyof PersonForm, value: string) {
    let formatted = value;
    if (key === "cpf") formatted = formatCpf(value);
    if (key === "telefone") formatted = formatPhone(value);
    if (key === "cep") formatted = formatCep(value);
    setForm((current) => ({ ...current, [side]: { ...current[side], [key]: formatted } }));
    const errorKey = `${side}.${key}`;
    if (errors[errorKey]) setErrors((current) => ({ ...current, [errorKey]: "" }));
  }

  function updateContract(key: keyof ContractForm, value: string | boolean) {
    setForm((current) => ({ ...current, contrato: { ...current.contrato, [key]: value } }));
    const errorKey = `contrato.${key}`;
    if (errors[errorKey]) setErrors((current) => ({ ...current, [errorKey]: "" }));
  }

  function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateForm(form);
    setErrors(validation);
    setSubmitError(null);
    if (Object.keys(validation).length > 0) {
      const firstInvalid = document.querySelector<HTMLElement>(".field-error input, .field-error select");
      firstInvalid?.focus();
      return;
    }
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createCadastro(toPayload(form));
      setResult(created);
      onCreated(created);
      setStep("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : "Não foi possível concluir o cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startOver() {
    setForm(initialForm());
    setErrors({});
    setSubmitError(null);
    setResult(null);
    setStep("form");
  }

  const dueDateShown = previewStatus === "confirmed" && apiDueDate ? apiDueDate : firstDueLocal;

  function personFields(side: PersonSide, person: PersonForm, showBirthDate: boolean) {
    return (
      <div className="form-grid">
        <InputField id={`${side}-nome`} label="Nome completo" error={errors[`${side}.nome`]}>
          <input id={`${side}-nome`} autoComplete="name" value={person.nome} onChange={(event) => updatePerson(side, "nome", event.target.value)} placeholder="Nome e sobrenome" aria-invalid={Boolean(errors[`${side}.nome`])} />
        </InputField>
        <div className="field-row">
          <InputField id={`${side}-rg`} label="RG" error={errors[`${side}.rg`]}>
            <input id={`${side}-rg`} value={person.rg} onChange={(event) => updatePerson(side, "rg", event.target.value)} placeholder="Número do documento" aria-invalid={Boolean(errors[`${side}.rg`])} />
          </InputField>
          <InputField id={`${side}-cpf`} label="CPF" error={errors[`${side}.cpf`]}>
            <input id={`${side}-cpf`} inputMode="numeric" autoComplete="off" value={person.cpf} onChange={(event) => updatePerson(side, "cpf", event.target.value)} placeholder="000.000.000-00" aria-invalid={Boolean(errors[`${side}.cpf`])} />
          </InputField>
        </div>
        {showBirthDate && (
          <InputField id="aluno-data_nascimento" label="Data de nascimento" error={errors["aluno.data_nascimento"]}>
            <input id="aluno-data_nascimento" type="date" max={todayLocal()} value={person.data_nascimento ?? ""} onChange={(event) => updatePerson("aluno", "data_nascimento", event.target.value)} aria-invalid={Boolean(errors["aluno.data_nascimento"])} />
          </InputField>
        )}
        <InputField id={`${side}-telefone`} label="Telefone" error={errors[`${side}.telefone`]}>
          <input id={`${side}-telefone`} inputMode="tel" autoComplete="tel" value={person.telefone} onChange={(event) => updatePerson(side, "telefone", event.target.value)} placeholder="(11) 90000-0000" aria-invalid={Boolean(errors[`${side}.telefone`])} />
        </InputField>
        <div className="field-row address-row">
          <InputField id={`${side}-cep`} label="CEP" error={errors[`${side}.cep`]}>
            <input id={`${side}-cep`} inputMode="numeric" autoComplete="postal-code" value={person.cep} onChange={(event) => updatePerson(side, "cep", event.target.value)} placeholder="00000-000" aria-invalid={Boolean(errors[`${side}.cep`])} />
          </InputField>
          <InputField id={`${side}-endereco`} label="Endereço" error={errors[`${side}.endereco`]}>
            <input id={`${side}-endereco`} autoComplete="address-line1" value={person.endereco} onChange={(event) => updatePerson(side, "endereco", event.target.value)} placeholder="Rua, avenida..." aria-invalid={Boolean(errors[`${side}.endereco`])} />
          </InputField>
          <InputField id={`${side}-numero`} label="Número" error={errors[`${side}.numero`]}>
            <input id={`${side}-numero`} autoComplete="off" value={person.numero} onChange={(event) => updatePerson(side, "numero", event.target.value)} placeholder="Nº ou s/n" aria-invalid={Boolean(errors[`${side}.numero`])} />
          </InputField>
        </div>
        <div className="field-row address-row">
          <InputField id={`${side}-complemento`} label="Complemento" required={false}>
            <input id={`${side}-complemento`} autoComplete="address-line2" value={person.complemento} onChange={(event) => updatePerson(side, "complemento", event.target.value)} placeholder="Apto, bloco..." />
          </InputField>
          <InputField id={`${side}-bairro`} label="Bairro" error={errors[`${side}.bairro`]}>
            <input id={`${side}-bairro`} autoComplete="address-level3" value={person.bairro} onChange={(event) => updatePerson(side, "bairro", event.target.value)} placeholder="Bairro" aria-invalid={Boolean(errors[`${side}.bairro`])} />
          </InputField>
        </div>
        <div className="field-row city-row">
          <InputField id={`${side}-cidade`} label="Cidade" error={errors[`${side}.cidade`]}>
            <input id={`${side}-cidade`} autoComplete="address-level2" value={person.cidade} onChange={(event) => updatePerson(side, "cidade", event.target.value)} placeholder="Cidade" aria-invalid={Boolean(errors[`${side}.cidade`])} />
          </InputField>
          <InputField id={`${side}-estado`} label="Estado" error={errors[`${side}.estado`]}>
            <select id={`${side}-estado`} autoComplete="address-level1" value={person.estado} onChange={(event) => updatePerson(side, "estado", event.target.value)} aria-invalid={Boolean(errors[`${side}.estado`])}>
              <option value="">UF</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </InputField>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" id="cadastro">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ACOLHIMENTO <span>·</span> NOVO REGISTRO</div>
              <h1>{step === "success" ? "Cadastro concluído" : step === "review" ? "Revise as informações" : "Novo acolhimento"}</h1>
              <p>{step === "success" ? "O backend confirmou o registro do contrato e das cobranças." : step === "review" ? "Confira os dados antes de confirmar o cadastro." : "Registre os dados do acolhido, responsável financeiro e contrato."}</p>
            </div>
            <div className="page-mark"><Icon name="file" size={21} /></div>
          </div>

          {step !== "success" && <div className="stepper" aria-label="Etapas do cadastro">
            <div className={`step-item ${step === "form" ? "current" : "complete"}`}><span className="step-number">{step === "review" ? <Icon name="check" size={15} /> : "1"}</span><span>Dados do cadastro</span></div>
            <span className="step-line" />
            <div className={`step-item ${step === "review" ? "current" : ""}`}><span className="step-number">2</span><span>Revisão</span></div>
          </div>}

          {step === "success" && result ? (
            <section className="success-card" aria-live="polite">
              <div className="success-icon"><Icon name="check" size={30} /></div>
              <div className="success-kicker">REGISTRO CONFIRMADO PELA API</div>
              <h2>Contrato nº {result.numero_contrato}</h2>
              <p>O acolhido, o responsável e as cobranças iniciais foram registrados.</p>
              <div className="success-details">
                <div><span>Primeiro vencimento</span><strong>{formatDate(result.primeiro_vencimento)}</strong></div>
                <div><span>Situação</span><strong className="success-status">Ativo</strong></div>
                <div><span>Mensalidade</span><strong>{result.mensalidade_valor_por_extenso}</strong></div>
                <div><span>Matrícula</span><strong>{result.matricula_id ? result.matricula_valor_por_extenso : "Sem cobrança"}</strong></div>
              </div>
              <button type="button" className="button button-primary" onClick={startOver}>Iniciar outro cadastro <Icon name="arrow" size={17} /></button>
            </section>
          ) : (
            <div className="content-layout">
              <div className="form-column">
                {step === "form" ? (
                  <form onSubmit={handleReview} noValidate>
                    <section className="form-card">
                      <div className="card-heading">
                        <span className="section-icon"><Icon name="people" size={19} /></span>
                        <div><span className="section-overline">01 · ACOLHIMENTO</span><h2>Dados do acolhido</h2><p>Informações pessoais de quem será acolhido.</p></div>
                      </div>
                      {personFields("aluno", form.aluno, true)}
                    </section>

                    <section className="form-card">
                      <div className="card-heading">
                        <span className="section-icon section-icon-sand"><Icon name="file" size={19} /></span>
                        <div><span className="section-overline">02 · RESPONSABILIDADE</span><h2>Responsável financeiro</h2><p>Dados da pessoa responsável pelos pagamentos.</p></div>
                      </div>
                      {personFields("responsavel_financeiro", form.responsavel_financeiro, false)}
                    </section>

                    <section className="form-card" id="contrato">
                      <div className="card-heading">
                        <span className="section-icon section-icon-blue"><Icon name="calendar" size={19} /></span>
                        <div><span className="section-overline">03 · PRESTAÇÃO DE SERVIÇOS</span><h2>Dados do contrato</h2><p>Condições financeiras e vencimentos acordados.</p></div>
                      </div>
                      <div className="form-grid contract-grid">
                        <InputField id="contrato-data_contrato" label="Data do contrato" error={errors["contrato.data_contrato"]}>
                          <input id="contrato-data_contrato" type="date" max={todayLocal()} value={form.contrato.data_contrato} onChange={(event) => updateContract("data_contrato", event.target.value)} aria-invalid={Boolean(errors["contrato.data_contrato"])} />
                        </InputField>
                        <InputField id="contrato-tipo_vaga" label="Tipo de vaga" error={errors["contrato.tipo_vaga"]}>
                          <select id="contrato-tipo_vaga" value={form.contrato.tipo_vaga} onChange={(event) => updateContract("tipo_vaga", event.target.value as ContractForm["tipo_vaga"])} aria-invalid={Boolean(errors["contrato.tipo_vaga"])}>
                            <option value="SOCIAL">Social</option>
                            <option value="PARTICULAR">Particular</option>
                          </select>
                        </InputField>
                        <InputField id="contrato-mensalidade_valor" label="Valor da mensalidade" error={errors["contrato.mensalidade_valor"]} hint="Até R$ 99.999.999,99">
                          <div className="money-input"><span>R$</span><input id="contrato-mensalidade_valor" inputMode="decimal" value={form.contrato.mensalidade_valor} onChange={(event) => updateContract("mensalidade_valor", event.target.value)} placeholder="0,00" aria-invalid={Boolean(errors["contrato.mensalidade_valor"])} /></div>
                        </InputField>
                        <InputField id="contrato-vencimento_dia" label="Dia de vencimento recorrente" error={errors["contrato.vencimento_dia"]} hint="De 1 a 31">
                          <input id="contrato-vencimento_dia" type="number" inputMode="numeric" min="1" max="31" value={form.contrato.vencimento_dia} onChange={(event) => updateContract("vencimento_dia", event.target.value)} placeholder="Ex.: 10" aria-invalid={Boolean(errors["contrato.vencimento_dia"])} />
                        </InputField>
                      </div>
                      <div className={`enrollment-toggle ${form.contrato.cobrar_matricula ? "enabled" : ""}`}>
                        <div className="toggle-copy"><span className="toggle-title">Cobrar matrícula neste contrato?</span><span className="toggle-caption">A cobrança de matrícula é independente da mensalidade.</span></div>
                        <label className="switch" aria-label="Cobrar matrícula">
                          <input type="checkbox" checked={form.contrato.cobrar_matricula} onChange={(event) => {
                            updateContract("cobrar_matricula", event.target.checked);
                            if (!event.target.checked) updateContract("matricula_valor", "");
                          }} />
                          <span className="switch-track" />
                        </label>
                      </div>
                      {form.contrato.cobrar_matricula && (
                        <div className="enrollment-amount">
                          <InputField id="contrato-matricula_valor" label="Valor da matrícula" error={errors["contrato.matricula_valor"]}>
                            <div className="money-input"><span>R$</span><input id="contrato-matricula_valor" inputMode="decimal" value={form.contrato.matricula_valor} onChange={(event) => updateContract("matricula_valor", event.target.value)} placeholder="0,00" aria-invalid={Boolean(errors["contrato.matricula_valor"])} /></div>
                          </InputField>
                          <p>O vencimento da matrícula será na data do contrato.</p>
                        </div>
                      )}
                    </section>
                    {Object.keys(errors).length > 0 && <div className="form-alert" role="alert"><span>Confira os campos destacados antes de continuar.</span></div>}
                    <div className="form-actions">
                      <span className="required-note"><span className="required-mark">*</span> Campos obrigatórios</span>
                      <button type="submit" className="button button-primary">Revisar cadastro <Icon name="arrow" size={17} /></button>
                    </div>
                  </form>
                ) : (
                  <section className="review-card">
                    <div className="review-topline"><span className="review-check"><Icon name="check" size={17} /></span><div><strong>Confira antes de confirmar</strong><span>As informações abaixo serão enviadas à API.</span></div></div>
                    {submitError && <div className="submit-error" role="alert"><strong>Não foi possível confirmar o cadastro.</strong><span>{submitError}</span></div>}
                    <div className="review-section">
                      <div className="review-section-heading"><h3>Acolhido</h3><button type="button" onClick={() => { setStep("form"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button></div>
                      <ReviewPerson person={form.aluno} />
                    </div>
                    <div className="review-section">
                      <div className="review-section-heading"><h3>Responsável financeiro</h3><button type="button" onClick={() => { setStep("form"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button></div>
                      <ReviewPerson person={form.responsavel_financeiro} />
                    </div>
                    <div className="review-section">
                      <div className="review-section-heading"><h3>Contrato</h3><button type="button" onClick={() => { setStep("form"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button></div>
                      <div className="review-grid">
                        <ReviewItem label="Tipo de vaga" value={form.contrato.tipo_vaga === "SOCIAL" ? "Social" : "Particular"} />
                        <ReviewItem label="Data do contrato" value={formatDate(form.contrato.data_contrato)} />
                        <ReviewItem label="Primeiro vencimento" value={formatDate(dueDateShown)} />
                        <ReviewItem label="Vencimento recorrente" value={`Dia ${form.contrato.vencimento_dia}`} />
                      </div>
                    </div>
                    <div className="review-consent"><Icon name="shield" size={17} /><span>Revise nomes, documentos e valores. Ao confirmar, o backend tentará registrar o cadastro e as cobranças numa única operação.</span></div>
                    <div className="form-actions review-actions">
                      <button type="button" className="button button-secondary" onClick={() => { setStep("form"); setSubmitError(null); }}>Voltar e editar</button>
                      <button type="button" className="button button-primary" onClick={handleConfirm} disabled={isSubmitting || apiOnline === false}>
                        {isSubmitting ? <><span className="button-spinner" /> Enviando…</> : <>Confirmar cadastro <Icon name="arrow" size={17} /></>}
                      </button>
                    </div>
                    {apiOnline === false && <div className="connection-note" role="status">A API está indisponível. O cadastro não será enviado até que a conexão seja restabelecida.</div>}
                  </section>
                )}
              </div>

              <aside className="summary-column" aria-label="Resumo do contrato">
                <section className="summary-card">
                  <div className="summary-heading"><div><span className="section-overline">CONFERÊNCIA</span><h2>Resumo inicial</h2></div><span className="summary-icon"><Icon name="chart" size={19} /></span></div>
                  <div className="summary-date-box">
                    <span><Icon name="calendar" size={15} /> DATA DO CONTRATO</span>
                    <strong>{form.contrato.data_contrato ? formatDate(form.contrato.data_contrato) : "A definir"}</strong>
                    <div className="date-connector"><span /></div>
                    <span><Icon name="calendar" size={15} /> PRIMEIRO VENCIMENTO</span>
                    <strong>{formatDate(dueDateShown)}</strong>
                    <small>30 dias corridos após a data do contrato</small>
                  </div>
                  {previewStatus === "confirmed" && <div className="preview-message preview-confirmed"><Icon name="check" size={14} /> Prévia conferida pela API</div>}
                  {previewStatus === "offline" && <div className="preview-message preview-offline">Prévia calculada localmente. Não foi possível validar com a API.</div>}
                  {previewStatus === "loading" && <div className="preview-message">Consultando a prévia da API…</div>}

                  <div className="charge-list">
                    <div className="charge-row"><div><strong>Mensalidade</strong><span>Primeiro vencimento · {formatDate(dueDateShown)}</span></div><strong>{formatBrl(monthlyCents)}</strong></div>
                    {form.contrato.cobrar_matricula ? (
                      <div className="charge-row"><div><strong>Matrícula</strong><span>Vencimento · {formatDate(form.contrato.data_contrato)}</span></div><strong>{formatBrl(enrollmentCents)}</strong></div>
                    ) : (
                      <div className="charge-row charge-row-muted"><div><strong>Matrícula</strong><span>Sem cobrança neste contrato</span></div><strong>—</strong></div>
                    )}
                  </div>
                  <div className="summary-total"><span>Total das cobranças iniciais</span><strong>{formatBrl(totalInitialCents)}</strong><small>Mensalidade + matrícula, quando aplicável</small></div>
                  <div className="summary-footnote"><Icon name="shield" size={16} /><span>A mensalidade e a matrícula são cobranças separadas.</span></div>
                </section>
                <div className="privacy-note"><span className="privacy-dot" /><span>Os dados serão enviados diretamente para a API do Átrio. Nenhuma informação é enviada ao Supabase pelo navegador.</span></div>
              </aside>
            </div>
          )}
    </div>
  );
}

function ReviewPerson({ person }: { person: PersonForm }) {
  const address = [person.endereco, person.numero, person.complemento, person.bairro, `${person.cidade} · ${person.estado}`, person.cep]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="review-grid">
      <ReviewItem label="Nome completo" value={person.nome} />
      <ReviewItem label="RG" value={person.rg} />
      <ReviewItem label="CPF" value={person.cpf} />
      {person.data_nascimento && <ReviewItem label="Nascimento" value={formatDate(person.data_nascimento)} />}
      <ReviewItem label="Telefone" value={person.telefone} />
      <ReviewItem label="Endereço" value={address} wide />
    </div>
  );
}

function ReviewItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`review-item ${wide ? "review-item-wide" : ""}`}><span>{label}</span><strong>{value || "—"}</strong></div>;
}

