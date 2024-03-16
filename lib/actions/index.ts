"use server";

import { User } from "@/types";
import { revalidatePath } from "next/cache";
import Product from "../models/product.mode";
import { connecttoDB } from "../mongoose";
import { scrapeAmazonProduct } from "../scraper";
import { getAveragePrice, getHighestPrice, getLowestPrice } from "../util";
import { generateEmailBody, sendEmail } from "../nodemailer";
import { redirect } from "next/navigation";

export async function scrapeAndStoreProduct(productUrl: string) {
  if (!productUrl) return;
  let prod;
  try {
    connecttoDB();

    const scrapedProduct = await scrapeAmazonProduct(productUrl);

    if (!scrapedProduct) return;

    let product = scrapedProduct;

    const existingProduct = await Product.findOne({ url: scrapedProduct.url });

    if (existingProduct) {
      const updatedPriceHistory = [
        ...existingProduct.priceHistory,
        { price: scrapedProduct.currentPrice },
      ];

      product = Object.assign({}, scrapedProduct, {
        priceHistory: updatedPriceHistory,
        lowestPrice: getLowestPrice(updatedPriceHistory),
        highestPrice: getHighestPrice(updatedPriceHistory),
        averagePrice: getAveragePrice(updatedPriceHistory),
      });
    }

    const filter = { url: scrapedProduct.url };
    const options = { upsert: true, new: true };
    const newProduct = await Product.findOneAndUpdate(filter, product, options);
    prod = newProduct._id;
    revalidatePath(`/products/${newProduct._id}`);
  } catch (error: any) {
    throw new Error(`Failed to create/update product: ${error.message}`);
  }
  redirect(`/products/${prod}`);
}

export async function getProductById(productId: string) {
  try {
    connecttoDB();

    const product = await Product.findOne({ _id: productId });

    if (!product) return null;

    return product;
  } catch (error) {
    console.log(error);
  }
}

export async function getAllProducts() {
  try {
    connecttoDB();
    const products = await Product.find();
    return products;
  } catch (error) {
    console.log(error);
  }
}
export async function getSimilarProducts(productId: string) {
  // this is used for similar products wala section
  try {
    connecttoDB();
    const currentProduct = await Product.findById(productId);
    if (!currentProduct) return null;
    // this will check that similar products will have their id not equal to productId of the current product
    const similarProducts = await Product.find({
      _id: { $ne: productId },
    }).limit(3);

    return similarProducts;
  } catch (error) {
    console.log(error);
  }
}

export async function addUserEmailToProduct(
  productId: string,
  userEmail: string
) {
  try {
    const product = await Product.findById(productId);

    if (!product) return;

    const userExists = product.users.some((user: User) => {
      user.email === userEmail;
    });

    if (!userExists) {
      product.users.push({ email: userEmail });
      await product.save();
      const emailContent = await generateEmailBody(product, "WELCOME");

      await sendEmail(await emailContent, [userEmail]);
    }
  } catch (error) {
    console.log(error);
  }
}
