export class FrontmatterBuilder {
	fm: Map<string, string>;

	constructor() {
		this.fm = new Map<string, string>();
	}

	add(k: string, v: string) {
		this.fm.set(k, v);
	}

	finish(): string {
		let fm = '---\n';
		this.fm.forEach((v, k) => {
			fm += `${k}: ${v}\n`
		});
		fm += '---\n'
		return fm;
	}
}
