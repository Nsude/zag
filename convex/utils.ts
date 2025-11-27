export function generateEmailPermutations(firstName: string, lastName: string, domain: string): string[] {
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();
  const cleanDomain = domain.replace(/^www\./, '');

  // User requested strict "firstname@domain" pattern
  const permutations = [
    `${first}@${cleanDomain}`,
  ];

  return permutations;
}

export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}
