// Cas 1 : validation du manifest XML (structure, permissions minimales, URLs HTTPS).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

function load(file: string) {
  const xml = readFileSync(join(root, file), 'utf8');
  return { xml, doc: parser.parse(xml) };
}

const asArray = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);

describe.each(['manifest.xml', 'manifest.dev.xml'])('%s', (file) => {
  const { xml, doc } = load(file);
  const app = doc.OfficeApp;

  it('est un XML bien formé de type MailApp', () => {
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(app['@xsi:type']).toBe('MailApp');
    expect(app['@xmlns']).toBe('http://schemas.microsoft.com/office/appforoffice/1.1');
  });

  it('possède un identifiant GUID valide, différent de celui du « Hello world »', () => {
    expect(app.Id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(app.Id).not.toBe('1e7e38da-7ad6-429a-9c6f-81aa1b9c9344');
    expect(app.Version).toMatch(/^1\.\d+\.\d+\.\d+$/);
  });

  it('cible Mailbox avec des requirement sets conservateurs (1.1 / 1.3)', () => {
    expect(app.Hosts.Host['@Name']).toBe('Mailbox');
    expect(app.Requirements.Sets.Set['@Name']).toBe('Mailbox');
    expect(app.Requirements.Sets.Set['@MinVersion']).toBe('1.1');
    const vo = app.VersionOverrides;
    expect(vo['@xsi:type']).toBe('VersionOverridesV1_0');
    expect(vo.Requirements['bt:Sets']['@DefaultMinVersion']).toBe('1.3');
  });

  it('demande la permission minimale ReadWriteItem (ni ReadWriteMailbox, ni EWS)', () => {
    expect(app.Permissions).toBe('ReadWriteItem');
    const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
    expect(withoutComments).not.toMatch(/ReadWriteMailbox/);
    expect(withoutComments).not.toMatch(/makeEwsRequest|ItemSend|LaunchEvent/);
  });

  it('déclare les surfaces de lecture et de composition avec ShowTaskpane', () => {
    const eps = asArray(app.VersionOverrides.Hosts.Host.DesktopFormFactor.ExtensionPoint);
    const types = eps.map((e: Record<string, string>) => e['@xsi:type']);
    expect(types).toEqual(expect.arrayContaining(['MessageReadCommandSurface', 'MessageComposeCommandSurface']));
    for (const ep of eps) {
      const control = ep.OfficeTab.Group.Control;
      expect(control.Action['@xsi:type']).toBe('ShowTaskpane');
    }
    const rules = asArray(app.Rule.Rule).map((r: Record<string, string>) => `${r['@ItemType']}:${r['@FormType']}`);
    expect(rules).toEqual(expect.arrayContaining(['Message:Read', 'Message:Edit']));
  });

  it('n’utilise que des URLs HTTPS et des ressources déclarées', () => {
    const urls = [...xml.matchAll(/DefaultValue="(https?:[^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) expect(u.startsWith('https://')).toBe(true);
    const declared = new Set([...xml.matchAll(/<bt:(?:Image|Url|String) id="([^"]+)"/g)].map((m) => m[1]));
    const used = [...xml.matchAll(/resid="([^"]+)"/g)].map((m) => m[1]);
    for (const r of used) expect(declared.has(r)).toBe(true);
    expect(xml).not.toMatch(/contoso|officedev\.github\.io|\{\{/i);
  });
});

it('les manifests de développement et de production ont des identifiants distincts', () => {
  expect(load('manifest.xml').doc.OfficeApp.Id).not.toBe(load('manifest.dev.xml').doc.OfficeApp.Id);
});
