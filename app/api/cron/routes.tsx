import Product from "@/lib/models/product.mode";
import { connecttoDB } from "@/lib/mongoose";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { scrapeAmazonProduct } from "@/lib/scraper";
import {
  getAveragePrice,
  getEmailNotifType,
  getHighestPrice,
  getLowestPrice,
} from "@/lib/util";
import { NextResponse } from "next/server";

export const maxDuration = 86400;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    connecttoDB();

    const products = await Product.find({});

    if (products.length === 0) {
      throw new Error("No products found");
    }

    // Let's scrape products first

    const updatedProducts = await Promise.all(
      products.map(async (currentProduct) => {
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);

        if (!scrapedProduct) {
          throw new Error("No Product Found");
        }

        const updatedPriceHistory = [
          ...currentProduct.priceHistory,
          { price: scrapedProduct.currentPrice },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
        };

        const filter = { url: product.url };

        const updatedProduct = await Product.findOneAndUpdate(filter, product);

        // checking status of everyone and sending email to them

        const emailNotifType = getEmailNotifType(
          scrapedProduct,
          currentProduct
        );

        if (emailNotifType && updatedProduct.users.length > 0) {
          const productInfo = {
            title: updatedProduct.title,
            url: updatedProduct.url,
          };

          const emailContent = await generateEmailBody(
            productInfo,
            emailNotifType
          );

          const userEmails = updatedProduct.users.map(
            (user: any) => user.email
          );

          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    return NextResponse.json({
      message: "ok",
      data: updatedProducts,
    });
  } catch (error) {
    throw new Error(`Error in GET: ${error}`);
  }
}
