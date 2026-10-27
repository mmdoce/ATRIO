import type { ReactNode } from "react";
import type { ContratoDetail } from "../api";
import { contractBlank, contractCurrency, contractEnrollmentValue, contractEnrollmentWords, contractVacancyLabel } from "../contractDocument";
import { formatDate } from "../format";

const address = (person: { endereco?: string | null; bairro?: string | null; cep?: string | null; cidade?: string | null; estado?: string | null }) =>
  [person.endereco, person.bairro, person.cep && `CEP ${person.cep}`, person.cidade, person.estado].filter(Boolean).join(" · ");

function Field({ label, children, wide = false }: { label: string; children: string; wide?: boolean }) {
  return <div className={`contract-field ${wide ? "contract-field-wide" : ""}`}><strong>{label}:</strong><span>{children || "____________________________________________"}</span></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="contract-section"><h2>{title}</h2>{children}</section>;
}

export function ContratoDocumento({ contrato }: { contrato: ContratoDetail }) {
  const aluno = contrato.aluno;
  const responsavel = contrato.responsavel_financeiro;
  const contractDate = formatDate(contrato.data_contrato);
  const enrollmentValue = contractEnrollmentValue(contrato.cobrar_matricula, contrato.matricula_valor);
  const enrollmentWords = contractEnrollmentWords(contrato.cobrar_matricula, contrato.matricula_valor_por_extenso);

  return <div className="contract-print-root">
    <article className="contract-document" aria-label={`Contrato de prestação de serviço número ${contrato.numero_contrato}`}>
      <header className="contract-brand"><strong>ÁTRIO</strong><span>CENTRO DE RECUPERAÇÃO</span><small>CNPJ 03.768.337/0002-12</small></header>
      <div className="contract-date-row"><span>Mogi das Cruzes, {contractDate}</span><strong>Nº DE CONTRATO: {contrato.numero_contrato}</strong></div>
      <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇO</h1>

      <Section title="1 — DO OBJETO"><p>Contrato de prestação de serviço objetivando o acolhimento e atendimento psicossocial e espiritual por internação voluntária, consentida e sem motivo de força maior ou coação ao acolhido (abaixo citado) nos moldes legais de COMUNIDADE TERAPÊUTICA, o qual aceita participar do programa de recuperação proposto por esta instituição.</p></Section>

      <Section title="2 — DAS PARTES">
        <p>A CONTRATADA, doravante denominada CENTRO DE RECUPERAÇÃO ÁTRIO, localizada e identificada pelo endereço e dados supracitados, firma contrato com:</p>
        <h3>CONTRATANTE (familiar ou responsável)</h3>
        <div className="contract-fields"><Field label="Nome" wide>{contractBlank(responsavel?.nome)}</Field><Field label="RG">{contractBlank(responsavel?.rg)}</Field><Field label="CPF">{contractBlank(responsavel?.cpf)}</Field><Field label="Telefone" wide>{contractBlank(responsavel?.telefone)}</Field><Field label="Endereço" wide>{address(responsavel ?? {}) || "____________________________________________"}</Field><Field label="CEP">{contractBlank(responsavel?.cep)}</Field><Field label="Bairro">{contractBlank(responsavel?.bairro)}</Field><Field label="Cidade">{contractBlank(responsavel?.cidade)}</Field><Field label="Estado">{contractBlank(responsavel?.estado)}</Field></div>
        <h3>DADOS DO ACOLHIDO (aluno)</h3>
        <div className="contract-fields"><Field label="Nome" wide>{contractBlank(aluno.nome)}</Field><Field label="Data de nascimento">{aluno.data_nascimento ? formatDate(aluno.data_nascimento) : "____/____/______"}</Field><Field label="RG">{contractBlank(aluno.rg)}</Field><Field label="CPF">{contractBlank(aluno.cpf)}</Field><Field label="Endereço" wide>{address(aluno) || "____________________________________________"}</Field><Field label="CEP">{contractBlank(aluno.cep)}</Field><Field label="Bairro">{contractBlank(aluno.bairro)}</Field><Field label="Cidade">{contractBlank(aluno.cidade)}</Field><Field label="Estado">{contractBlank(aluno.estado)}</Field><Field label="Telefone" wide>{contractBlank(aluno.telefone)}</Field></div>
      </Section>

      <Section title="CLÁUSULA 1ª — DO TRATAMENTO">
        <p>1.1 O tratamento do acolhido será realizado dentro da instituição com sessões de atendimento psicológico individual e em grupo, atividades laboterapêuticas, recreativas, lazer, organização do meio em que vive, aprendizagem, reinserção social e reuniões espirituais.</p>
        <p>1.2 O programa de internação tem cronograma estimado em 9 meses, este período poderá ser estendido ou abreviado, de acordo com critérios e discussões da equipe técnica da instituição, familiares e o próprio interno, e a ALTA TERAPÊUTICA se dará por avaliação da equipe técnica (Psicólogo, Coordenador Espiritual e Técnico de Desenvolvimento Humano).</p>
        <p>1.3 Os familiares, por sua vez, poderão fazer visitas ao acolhido nos fins de semana, onde serão orientados por membros da equipe técnica a serem inseridos no contexto terapêutico como coparticipantes da recuperação e da reconstrução do vínculo familiar.</p>
        <p>1.4 A alta por ABANDONO se dará por manifestação do próprio acolhido, e o mesmo registrará o motivo, se assim o quiser, do seu desligamento. A CONTRATADA tem um período de até 24h para contatar o responsável ou familiares via telefone ou e-mail.</p>
        <p>1.5 A alta ADMINISTRATIVA ocorrerá por desrespeito às normas do PROGRAMA DE RECUPERAÇÃO, REGIMENTO INTERNO e ao TERMO DE COMPROMISSO, dos quais o acolhido e o responsável tomaram ciência no ato da internação.</p>
        <p>1.6 A alta por FUGA será comunicada à família ou responsável e será registrada no prontuário do interno com data e hora da descoberta da evasão.</p>
      </Section>

      <Section title="DA CONTRIBUIÇÃO">
        <p>2.1 A contratação somente será efetiva, salvo nos casos de VAGA SOCIAL, com pagamento da TAXA DE MATRÍCULA da instituição, e após 30 (trinta) dias, conforme a data deste contrato, o CONTRATANTE assume o compromisso do pagamento da 1ª parcela.</p>
        <p className="contract-emphasis">2.2 O não pagamento acarretará no desligamento do acolhido do programa terapêutico no prazo improrrogável de 5 dias do vencimento da contribuição. O não cumprimento desta cláusula poderá dar margem às medidas legais cabíveis.</p>
        <p>2.3 As vagas sociais seguirão os critérios de ofertas da direção, sendo estas disponibilizadas de acordo com o perfil socio familiar do acolhido e a oferta de vagas.</p>
      </Section>

      <Section title="DO VALOR DO CONTRATO">
        <p>3.1 A CONTRATADA cobrará pelos serviços prestados, objeto do presente contrato, o valor mensal de:</p>
        <div className="contract-fields"><Field label="Valor mensal (R$)">{contractCurrency(contrato.mensalidade_valor)}</Field><Field label="Valor por extenso" wide>{contrato.mensalidade_valor_por_extenso}</Field><Field label="Valor da matrícula (R$)">{enrollmentValue}</Field><Field label="Valor por extenso" wide>{enrollmentWords}</Field><Field label="Tipo da vaga">{contractVacancyLabel(contrato.tipo_vaga)}</Field><Field label="Primeiro vencimento">{formatDate(contrato.primeiro_vencimento)}</Field></div>
      </Section>

      <Section title="DOS DEVERES DO CONTRATANTE">
        <p>3.1 Tomar ciência do REGIMENTO INTERNO e das NORMAS DE CONVÍVIO da instituição antes de firmar este contrato.</p>
        <p>3.2 É dever do responsável pela internação honrar com o pagamento mensal firmado neste contrato.</p>
        <p>3.3 Participar da recuperação do acolhido e das reuniões familiares mensais sempre que convocado.</p>
        <p>3.4 Fazer o acompanhamento do acolhido nos tratamentos clínicos, exames e consultas hospitalares que por ventura sejam necessários ao acolhido.</p>
        <p>3.5 Trazer hemograma sanguíneo completo do acolhido, produtos de higiene pessoal, roupas, botas, cadeados para armário e, quando necessário e após consulta médica, os medicamentos com receita médica prescrita por um profissional da área de saúde.</p>
      </Section>

      <Section title="DOS DEVERES DA INSTITUIÇÃO">
        <p>4.1 Possuir um responsável técnico disponível para as mais diversas informações e que tenha a responsabilidade por ministrar os medicamentos, com receituário médico, nos devidos horários e dosagens.</p>
        <p>4.2 Ter sempre pessoas capacitadas para o atendimento de eventuais crises emocionais do acolhido.</p>
        <p>4.3 Manter informados os responsáveis ou familiares do acolhido, via telefone ou pessoalmente, sobre a participação, resultados e satisfação do interno no programa de recuperação.</p>
        <p>4.4 Zelar pela segurança, saúde, alimentação e bem-estar do acolhido no que tange ao universo da comunidade terapêutica.</p>
        <p>4.5 Honrar com o programa terapêutico proposto (atendimento psicológico, laboterapêutico, espiritual, social e familiar) no que trata o universo da dependência química.</p>
        <p>4.6 Fica eleito o foro da comarca de Mogi das Cruzes, estado de São Paulo, para dirimir quaisquer questões atinentes ao presente instrumento.</p>
      </Section>

      <Section title="DECLARAÇÃO DE COMPROMISSO E ADESÃO ÀS NORMAS">
        <p>Eu, {contractBlank(aluno.nome)}, inscrito(a) no CPF sob o nº {contractBlank(aluno.cpf)}, declaro para os devidos fins que estou ciente e de acordo com todas as normas e diretrizes estabelecidas pelo Centro de Recuperação Átrio, comunidade terapêutica voltada à recuperação de dependentes químicos.</p>
        <p>Declaro, ainda, que minha permanência nesta instituição é totalmente voluntária e consciente, e que me comprometo a cumprir integralmente todas as atividades propostas e delegadas pela equipe técnica, incluindo, mas não se limitando a:</p>
        <ul><li>Laborterapias;</li><li>Atividades de espiritualidade;</li><li>Atividades terapêuticas;</li><li>Atividades inclusivas;</li><li>Atividades recreativas e lúdicas;</li><li>Atividades de socialização;</li><li>Atividades de organização e manutenção do ambiente em que resido.</li></ul>
        <p>Estou ciente de que o descumprimento das normas e compromissos estabelecidos poderá acarretar em meu desligamento da instituição, de acordo com avaliação da equipe responsável.</p>
        <p>Por ser expressão da minha livre e espontânea vontade, firmo a presente declaração.</p>
      </Section>

      <Section title="TERMO DE COMPROMISSO">
        <p>E por estarem juntas e contratadas, as partes assinam o presente termo, juntamente com a testemunha abaixo identificada.</p>
        <p>Mogi das Cruzes, {contractDate}</p>
        <div className="contract-signatures">
          <div><strong>CONTRATANTE</strong><span>Nome: {contractBlank(responsavel?.nome)}</span><span>RG: {contractBlank(responsavel?.rg)}</span><i /><small>Assinatura</small></div>
          <div><strong>CONTRATADA — CENTRO DE RECUPERAÇÃO ÁTRIO</strong><span>CNPJ: 03.768.337/0002-12</span><span>Aldico Sousa Santos (Presidente)</span><i /><small>Assinatura</small></div>
          <div><strong>INTERNO</strong><span>Nome: {contractBlank(aluno.nome)}</span><i /><small>Assinatura</small></div>
          <div><strong>Norval do Carmo (Co-responsável técnico)</strong><i /><small>Assinatura</small></div>
          <div className="contract-signature-bottom"><i /><small>Interno</small></div><div className="contract-signature-bottom"><i /><small>Responsável</small></div>
        </div>
      </Section>
      <footer className="contract-print-footer">Estrada MN do Rio Grande, 20 – Pq. São Martinho – Mogi das Cruzes – SP&nbsp; | &nbsp;(11) 94329-7875&nbsp; | &nbsp;atrio.prbob@gmail.com</footer>
    </article>
  </div>;
}
