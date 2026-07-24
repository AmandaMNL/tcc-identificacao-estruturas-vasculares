import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getSystemPrompt, getUserPromptTemplate } from './prompts/image.analiser.ts';
import { OpenRouterService } from './services/openrouter.service.ts';
import { ImageTransformService } from './services/image.transform.ts';

const vascularAnalysisSchema = z.object({
	summary: z.string(),
	vascular_findings: z.array(z.string()),
	confidence: z.number().min(0).max(1),
	follow_up_questions: z.array(z.string()).min(1).max(3),
});

const MIME_BY_EXTENSION: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
};

const SEND_IMAGE_TO_LLM = (process.env.LLM_SEND_IMAGE ?? 'true').toLowerCase() === 'true';

const resolveMimeType = (imagePath: string): string => {
	const ext = path.extname(imagePath).toLowerCase();
	return MIME_BY_EXTENSION[ext] ?? 'image/png';
};

const resolveLocalImagePath = (imagePathArg: string): string => {
	const directPath = path.resolve(process.cwd(), imagePathArg);

	if (existsSync(directPath)) {
		return directPath;
	}

	const ext = path.extname(imagePathArg) || '.png';
	const base = path.basename(imagePathArg, ext);
	const fallbackName = `${base}_rgb_labels${ext}`;
	const fallbackPath = path.resolve(process.cwd(), 'data/images', fallbackName);

	if (existsSync(fallbackPath)) {
		return fallbackPath;
	}

	throw new Error(`Imagem nao encontrada: ${imagePathArg}`);
};

const main = async () => {
	const imagePathArg = process.argv[2];
	const questionArg = process.argv.slice(3).join(' ').trim();

	if (!imagePathArg) {
		throw new Error('Uso: npm run analyze:image -- data/images/2.png "sua pergunta"');
	}

	const imagePath = imagePathArg.trim();
	const absolutePath = SEND_IMAGE_TO_LLM ? resolveLocalImagePath(imagePath) : null;
	const imageBase64 = absolutePath ? readFileSync(absolutePath).toString('base64') : '';
	const imageMimeType = absolutePath ? resolveMimeType(absolutePath) : 'image/png';
	const question = questionArg || 'Identify vascular structures present in this image.';

	const transformService = new ImageTransformService();
	const llmService = new OpenRouterService();

	try {
		const imageContext = await transformService.getImageContext(imagePath, Number(process.env.NEO4J_TOP_K ?? 3));
		const systemPrompt = getSystemPrompt();
		const userPrompt = getUserPromptTemplate(question, imageContext.promptContext);

		const result = SEND_IMAGE_TO_LLM
			? await llmService.generateStructuredFromImage(
				systemPrompt,
				userPrompt,
				imageBase64,
				vascularAnalysisSchema,
				imageMimeType,
			)
			: await llmService.generateStructured(
				systemPrompt,
				userPrompt,
				vascularAnalysisSchema,
			);

		if (!result.success) {
			throw new Error(result.error);
		}

		console.log(JSON.stringify(result.data, null, 2));
	} finally {
		await transformService.close();
	}
};

main().catch((error: unknown) => {
	console.error('[analyze:image] Falha na analise vascular multimodal.');
	console.error(error);
	process.exit(1);
});