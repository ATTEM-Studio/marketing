export interface SafetyResult {
  blocked: boolean;
  reason?:
    "fake_review" | "paid_traffic" | "ranking_guarantee" | "review_coercion";
  alternativeActionKey?: string;
}

const phonePattern = /(?:\+?82[-.\s]?)?0?1[016789](?:[-.\s]?\d{3,4}){2}/giu;
const emailPattern =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu;
const namedOwnerPattern = /[가-힣]{1,4}(?:사장님?|대표님?)/gu;
const inviteCodePattern =
  /((?:초대\s*코드|invite\s*code)\s*[:：]?\s*)[a-z0-9-]{4,}/giu;

const accessCodePattern =
  /((?:(?:invite|access)(?:\s|-)?code|초대\s*코드|접속\s*코드|인증\s*코드)\s*[:：]?\s*)[a-z0-9-]{4,}/giu;
const ownerNamePattern = /(?:[가-힣]{1,4}\s*)?(?:사장님?|대표님?)/gu;
const labeledOwnerNamePattern =
  /((?:이름|성명|owner\s*name|name)\s*[:：]\s*)(?:[가-힣]{2,4}|[a-z]{2,}(?:\s+[a-z]{2,})?)/giu;
const sourceLinePattern =
  /(?:^|\n)\s*(?:전자책\s*원문|출처|source|file|파일)\s*[:：][^\n]*/gimu;
const sourceLabelPattern = /(?:출처|source|file|파일)\s*[:：][^\n]*/gimu;
const ebookPhrasePattern = /전자책\s*원문/gu;

function normalized(question: string): string {
  return question.toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

export function sanitizeQuestion(question: string): string {
  return question
    .replace(sourceLinePattern, "\n")
    .replace(sourceLabelPattern, "")
    .replace(ebookPhrasePattern, "")
    .replace(emailPattern, "")
    .replace(phonePattern, "")
    .replace(namedOwnerPattern, "")
    .replace(ownerNamePattern, "")
    .replace(labeledOwnerNamePattern, "$1")
    .replace(inviteCodePattern, "$1")
    .replace(accessCodePattern, "$1")
    .replace(/\s+([,.!?])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim()
    .replace(/[,;]\s*[,;]+/gu, ",")
    .slice(0, 500);
}

export function detectProhibitedRequest(question: string): SafetyResult {
  const value = normalized(question);

  if (
    /(?:가짜|허위|조작).{0,12}(?:리뷰|후기)|(?:리뷰|후기).{0,12}(?:대필|구매|조작)|fake\s*(?:review|rating)|buy\s*(?:review|rating)/iu.test(
      value,
    )
  ) {
    return {
      blocked: true,
      reason: "fake_review",
      alternativeActionKey: "complete_visit_information",
    };
  }

  if (
    /(?:구매|매입).{0,12}(?:트래픽|방문자|클릭)|(?:트래픽|방문자|클릭).{0,12}(?:구매|매입)|buy\s*(?:traffic|clicks|visitors)|purchased?\s*traffic/iu.test(
      value,
    )
  ) {
    return {
      blocked: true,
      reason: "paid_traffic",
      alternativeActionKey: "track_ad_to_visit_path",
    };
  }

  if (
    /(?:상위\s*노출|검색\s*순위|랭킹|ranking).{0,16}(?:보장|확정|guarantee)|(?:보장|guarantee).{0,16}(?:상위\s*노출|검색\s*순위|랭킹|ranking)/iu.test(
      value,
    )
  ) {
    return {
      blocked: true,
      reason: "ranking_guarantee",
      alternativeActionKey: "complete_visit_information",
    };
  }

  if (
    /(?:리뷰|후기).{0,20}(?:강요|강제|유도|문구|표현).{0,20}(?:써|작성|요청|메시지|write)|(?:강요|강제|coerce|force).{0,20}(?:리뷰|후기|review)|(?:review).{0,20}(?:coerce|force|wording)/iu.test(
      value,
    )
  ) {
    return {
      blocked: true,
      reason: "review_coercion",
      alternativeActionKey: "complete_visit_information",
    };
  }

  return { blocked: false };
}
