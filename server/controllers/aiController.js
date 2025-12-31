import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import Groq from "groq-sdk";
const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

const client = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});


const clientGro = new Groq({ apiKey: process.env.GROQ_API_KEY });


export const generateArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        console.log("plan:", plan, "free_usage:", free_usage);
        console.log("prompt:", prompt);
        console.log("length:", length);

        if (plan !== "premium" && free_usage >= 10) {
            return res.json({
                success: false,
                message: "Limit reached. Upgrade to continue."
            });
        }

        // GROQ ARTICLE GENERATION
        const response = await clientGro.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "user",
                    content: `
Write a detailed article based on this prompt:
"${prompt}"

Required length: ${length} words.
Make it structured, SEO-friendly, and human-like.
`
                }
            ],
            temperature: 0.7,
            max_tokens: length * 5,
        });

        const content = response.choices[0].message.content;

        await sql`
            INSERT INTO creations (user_id, prompt, content, type)
            VALUES (${userId}, ${prompt}, ${content}, 'article')
        `;

        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            });
        }

        res.json({ success: true, content });

    } catch (error) {
        console.log("error:", error.message);
        res.json({ success: false, message: error.message });
    }
};


/*export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." })
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.5-flash",
            messages: [{
                role: "user",
                content: prompt,
            },
            ],
            temperature: 0.7,
            max_tokens: 100 * 16,
        });

        const content = response.choices[0].message.content

        await sql` INSERT INTO CREATIONS (user_id, prompt, content, type)
        VALUES (${userId}, ${prompt}, ${content}, 'blog-title')`

        if (plan != 'premium') {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            })
        }

        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })

    }

}*/

export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        // Free users = 10 generations only
        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to continue." });
        }

        // GROQ API CALL
        const response = await clientGro.chat.completions.create({
            model: "llama-3.3-70b-versatile",  // latest working model
            messages: [
                {
                    role: "user",
                    content: `Generate 10 high-quality blog titles based on this idea:\n${prompt}`
                }
            ],
            temperature: 0.7,
            max_tokens: 300,
        });

        const content = response.choices[0].message.content;

        // Store in DB
        await sql`
            INSERT INTO CREATIONS (user_id, prompt, content, type)
            VALUES (${userId}, ${prompt}, ${content}, 'blog-title')
        `;

        // Update free limit
        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            });
        }

        res.json({ success: true, content });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};


export const generateImage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, publish } = req.body;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." })
        }

        const formData = new FormData()
        formData.append('prompt', prompt)
        const { data } = await axios.post("https://clipdrop-api.co/text-to-image/v1", formData, {
            headers: { 'x-api-key': process.env.CLIPDROP_API_KEY, },
            responseType: "arraybuffer",
        })

        const base64Image = `data:image/png;base64,${Buffer.from(data, 'binary').toString('base64')}`;

        const { secure_url } = await cloudinary.uploader.upload(base64Image)





        await sql` INSERT INTO CREATIONS (user_id, prompt, content, type, publish)
        VALUES (${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})`;



        res.json({ success: true, content: secure_url })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })

    }

}

export const removeImageBackground = async (req, res) => {
    try {
        const { userId } = req.auth();
        const image  = req.file;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." })
        }


        const { secure_url } = await cloudinary.uploader.upload(image.path, {
            transformation: [
                {
                    effect: 'background_removal',
                    background_removal: 'remove_the_background'
                }
            ]
        })





        await sql` INSERT INTO CREATIONS (user_id, prompt, content, type)
        VALUES (${userId}, 'Remove backgound fromimage', ${secure_url}, 'image')`;



        res.json({ success: true, content: secure_url })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })

    }

}

export const removeImageObject = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { object } = req.body;
        const image  = req.file;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." })
        }


        const { public_id } = await cloudinary.uploader.upload(image.path)

        const imageUrl = cloudinary.url(public_id, {
            transformation: [{ effect: `gen_remove:${object}` }],
            resource_type: 'image'
        })





        await sql` INSERT INTO CREATIONS (user_id, prompt, content, type)
        VALUES (${userId}, ${`Removed ${object} from image`}, ${imageUrl}, 'image')`;



        res.json({ success: true, content: imageUrl })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })

    }

}

/*export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();

        const resume = req.file;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." })
        }

        if (resume.size > 5 * 1024 * 1024) {
            return res.json({ success: false, message: "Resume file size exceeds allowed size (5MB)." })
        }

        const dataBuffer = fs.readFileSync(resume.path)

        const pdfData = await pdf(dataBuffer)

        const prompt = `Review the following resume and provide constructive feedback on its strengths, weaknesses, and areas for improvement. Resume Content:\n\n${pdfData.text}`

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: prompt, }],
            temperature: 0.7,
            max_tokens: 1000 * 20,
        });

        const content = response.choices[0].message.content










        await sql` INSERT INTO CREATIONS (user_id, prompt, content, type)
        VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')`;



        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })

    }

}*/

/*export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;

        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." })
        }

        if (resume.size > 5 * 1024 * 1024) {
            return res.json({ success: false, message: "Resume file size exceeds allowed size (5MB)." })
        }

        const dataBuffer = fs.readFileSync(resume.path)
        const pdfData = await pdf(dataBuffer)

        // Reduce PDF text
       const prompt = `
Extract key points from this resume only:
${pdfData.text.slice(0, 2500)}
`;


        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
        });

        const content = response.choices[0].message.content

        await sql`
        INSERT INTO CREATIONS (user_id, prompt, content, type)
        VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')`;

        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}


*/

/*export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;

        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscription." });
        }

        if (resume.size > 5 * 1024 * 1024) {
            return res.json({ success: false, message: "File too large (max 5MB)." });
        }

        const dataBuffer = fs.readFileSync(resume.path);
        const pdfData = await pdf(dataBuffer);

        const prompt = `
        Review this resume. Give:
        - Strengths
        - Weaknesses
        - Improvements
        - ATS friendliness score
        Resume text:
        ${pdfData.text}
        `;

        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1500,
            temperature: 0.7,
        });

        const content = response.choices[0].message.content;

        await sql`
            INSERT INTO CREATIONS (user_id, prompt, content, type)
            VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')
        `;

        res.json({ success: true, content });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};*/

export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;

        if (plan !== "premium") {
            return res.json({ success: false, message: "Premium required" });
        }

        const dataBuffer = fs.readFileSync(resume.path);
        const pdfData = await pdf(dataBuffer);

        const prompt = `
        Review this resume. Give strengths, weaknesses, and improvements:
        ${pdfData.text}
        `;

        const response = await clientGro.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1500,
        });

        const content = response.choices[0].message.content;

        await sql`
            INSERT INTO CREATIONS (user_id, prompt, content, type)
            VALUES (${userId}, 'Resume Review', ${content}, 'resume-review')
        `;

        res.json({ success: true, content });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};