/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono, Context, Next } from "hono";
import { Resend } from "resend";
import { env } from "cloudflare:workers"
import { cors } from "hono/cors"

const app = new Hono();

interface Env {
	ASSETS: Fetcher,
	WORKER_EMAIL: string,
	RESEND_API_KEY: string,
	SECRET_KEY: string,
}

//这个参数先去wrangler.jsonc中配置环境变量
//每次改wrangler.jsonc后，都需要跑一下npx wrangler types
//否则会报错，说RESEND_API_KEY is not defined
//密钥写在.dev.vars中，后面上传到workers secret里
const resend = new Resend((env as Env).RESEND_API_KEY);

app.use(cors({
	origin: "*",
	allowMethods: ["GET", "POST"],
	// allowHeaders: ["Content-Type"],
	// allowCredentials: true,
}))

// 辅助函数：时序安全比较
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const aBuf = new TextEncoder().encode(a);
  const bBuf = new TextEncoder().encode(b);
  // Cloudflare Workers 支持 crypto.subtle.timingSafeEqual
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
}

const requireAuth = async (c: Context, next: Next) => {
  // 对于 OPTIONS 预检请求放行（CORS）
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7); // 去掉 'Bearer '
  const expectedToken = (c.env as Env).SECRET_KEY;

  // 使用时序安全比较（防止时序攻击）
  const isValid = await timingSafeEqual(token, expectedToken);
  if (!isValid) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401);
  }

  await next();
};

app.get("/", async (c) => {
	const response = await (c.env as Env).ASSETS.fetch(
		new URL("./DOC.html", c.req.url)
	)

	if (!response) {
		return c.text("404 Not Found", 404)
	}

	const html = await response.text()
	return c.html(html)
})

app.get("/send", async (c) => {
	const response = await (c.env as Env).ASSETS.fetch(
		new URL("./DOC.html", c.req.url)
	)

	if (!response) {
		return c.text("404 Not Found", 404)
	}

	const html = await response.text()
	return c.html(html)
})

enum content_types {
	html = "text/html",
	text = "text/plain",
	json = "application/json",
	form_urlencoded = "application/x-www-form-urlencoded",
	form_data = "multipart/form-data",
}

interface req_body {
	from: string,
	to: string | string[],
	subject: string,
	text: string,
	content_type?: content_types,
	cc?: string | string[],
	bcc?: string | string[],
}

// 推荐的正则：本地部分无空格/@，域名部分至少两个点分段，顶级域至少2个字符
const EMAIL_REGEX = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;

function getMulti(formdata: FormData, key: string): string | string[] | undefined {
	// 辅助函数：获取表单数据中指定键的所有值
	const all = formdata.getAll(key).filter(v => typeof v === "string") as string[];
	if (all.length === 0) return undefined;
	if (all.length === 1) return all[0];
	return all;
};

function validateEmail(email: string | string[]): true | string | string[] {
	// 辅助函数：判断单个字符串是否合法
	const isSingleValid = (e: string): boolean => EMAIL_REGEX.test(e);

	if (Array.isArray(email)) {
		const invalidList = email.filter(e => !isSingleValid(e));
		return invalidList.length === 0 ? true : invalidList;
	} else {
		return isSingleValid(email) ? true : email;
	}
}

// interface ResendEmailOptions {
// 	from: string,
// 	to: string | string[],
// 	subject: string,
// 	text: string,
// 	attachment?:any[],
// 	headers?:Record<string, string>,
// 	cc?: string | string[],
// 	bcc?: string | string[],
// }

app.post("/send", requireAuth, async (c) => {
	const request_content_type = c.req.header("Content-Type") || "";

	let req_content: req_body;

	if (request_content_type.startsWith(content_types.json)) {
		// JSON 请求，直接解析
		req_content = await c.req.json();
	} else if (
		request_content_type.startsWith(content_types.form_urlencoded) ||
		request_content_type.startsWith(content_types.form_data)
	) {
		// 表单请求 (urlencoded 或 multipart)，使用 parseBody 得到普通对象
		const formdata = await c.req.formData();
		// 将 parseBody 返回的对象转换为 req_body 结构
		req_content = {
			from: formdata.get("from") || "",
			to: getMulti(formdata, "to"),
			subject: formdata.get("subject") || "",
			text: formdata.get("text") || "",
			content_type: formdata.get("content_type") as content_types | undefined,
			cc: getMulti(formdata, "cc"),
			bcc: getMulti(formdata, "bcc"),
		} as req_body;   // 可根据实际情况进一步验证
	} else {
		// 不支持的 Content-Type
		return c.text("Unsupported Request Media Type", 415);
	}
	const {
		from, to, subject, text, cc, bcc,
		content_type
	} = req_content

	let email_content_type = content_types.text

	if (content_type) {
		if (
			content_type !== content_types.text
			&& content_type !== content_types.html
		) {
			return c.json({ error: `\"content_type\" must be ${content_types.text} or ${content_types.html}` })
		}
		email_content_type = content_type
	}

	// 4个参数非空
	// if (!from || !to || !subject || !text) {
	// 	return c.json({ error: "from, to, subject, text are required" })
	// }
	if (!from) {
		return c.json({ error: '\"from\" is required' })
	}
	if (!to) {
		return c.json({ error: '\"to\" is required' })
	}
	if (!subject) {
		return c.json({ error: '\"subject\" is required' })
	}
	if (!text) {
		return c.json({ error: '\"text\" is required' })
	}

	// to可以是字符串或数组，但是得是邮箱，格式校验
	// const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/
	const to_valid = validateEmail(to)
	if (Array.isArray(to_valid)) {
		return c.json({ error: `\"to\" must be valid emails: ${to_valid.join(",")}` })
	} else if (typeof to_valid === "string") {
		return c.json({ error: `\"to\" must be a valid email: ${to_valid}` })
	}

	//cc和bcc可以是字符串或数组，但是得是邮箱，格式校验
	if (cc) {
		const cc_valid = validateEmail(cc)
		if (Array.isArray(cc_valid)) {
			return c.json({ error: `\"cc\" must be valid emails: ${cc_valid.join(",")}` })
		} else if (typeof cc_valid === "string") {
			return c.json({ error: `\"cc\" must be a valid email: ${cc_valid}` })
		}
	}

	if (bcc) {
		const bcc_valid = validateEmail(bcc)
		if (Array.isArray(bcc_valid)) {
			return c.json({ error: `\"bcc\" must be valid emails: ${bcc_valid.join(",")}` })
		} else if (typeof bcc_valid === "string") {
			return c.json({ error: `\"bcc\" must be a valid email: ${bcc_valid}` })
		}
	}
	// let a = await c.req.formData()
	// console.log(a)
	// console.log(a.get("from"))
	// console.log(getMulti(a, "to"))
	// return c.json(req_content)

	const { data, error } = await resend.emails.send({
		from: from + " <" + (c.env as Env).WORKER_EMAIL + ">",
		// to: "to@example.com",
		to: to,
		// subject: "Hello World!",
		subject: subject,
		// text: text,
		cc: cc,
		bcc: bcc,
		...(email_content_type === content_types.text)
			? { text: text }
			: { html: text },
	})

	if (error) {
		return c.json({ error: error.message })
	}
	return c.json({ send_id: data.id })
})

export default app
