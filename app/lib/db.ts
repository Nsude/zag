import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'contacted_companies.json');

export interface ContactedCompany {
  domain: string;
  companyName: string;
  founderName: string;
  email: string;
  sentAt: string;
}

function readDb(): ContactedCompany[] {
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading DB:", error);
    return [];
  }
}

function writeDb(data: ContactedCompany[]) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function isCompanyContacted(domain: string): boolean {
  const db = readDb();
  return db.some((c) => c.domain === domain);
}

export function markCompanyAsContacted(company: ContactedCompany) {
  const db = readDb();
  db.push(company);
  writeDb(db);
}

export function getContactedCompanies(): ContactedCompany[] {
    return readDb();
}
